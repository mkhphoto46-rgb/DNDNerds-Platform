import "dotenv/config";

import { resolve } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is missing");

  const client = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: resolve(__dirname, "../../drizzle"),
    });

    await client`INSERT INTO public.marketplace_config (id) VALUES ('global') ON CONFLICT (id) DO NOTHING`;

    // The app connects directly as its database owner. Its tables must not
    // become available to Supabase's public Data API roles by default.
    const dataApiRoles = await client<{ rolname: string }[]>`
      SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
    `;
    for (const role of dataApiRoles) {
      await client.unsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "${role.rolname}"`);
      await client.unsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM "${role.rolname}"`);
    }
    const tables = await client<{ tablename: string }[]>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tableowner = current_user
    `;
    for (const table of tables) {
      await client.unsafe(`ALTER TABLE public."${table.tablename.replaceAll('"', '""')}" ENABLE ROW LEVEL SECURITY`);
    }
    console.log("Database migrations and public API restrictions complete");
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
