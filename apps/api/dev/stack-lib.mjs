// Local PostgreSQL and Redis for development and tests, without Docker.
//
// PostgreSQL comes from the `embedded-postgres` package (official binaries,
// no install, no admin rights). Redis is any Redis-compatible server: set
// REDIS_URL to one that is already running, or GARNET_SERVER_PATH to a
// Microsoft Garnet executable (`GarnetServer`) that this module starts.
// Docker users can keep using infra/docker-compose.yml instead.
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import EmbeddedPostgres from "embedded-postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => { socket.end(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}

/** Starts PostgreSQL in `dir` and creates `database`. Returns its URL and a stop function. */
export async function startPostgres({ dir, port, database, persistent = false }) {
  const user = "dnd";
  const password = "local-only";
  const dataDir = path.join(dir, "postgres");
  const exists = fs.existsSync(path.join(dataDir, "PG_VERSION"));
  const pg = new EmbeddedPostgres({ databaseDir: dataDir, user, password, port, persistent, onLog: () => {} });
  if (!exists) await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase(database);
  } catch (error) {
    if (!/already exists/i.test(String(error?.message ?? error))) throw error;
  }
  return {
    url: `postgres://${user}:${password}@127.0.0.1:${port}/${database}`,
    stop: () => pg.stop(),
  };
}

/** A Redis-compatible server: REDIS_URL when set, else GarnetServer started on `port`. */
export async function startRedis({ port }) {
  if (process.env.REDIS_URL) return { url: process.env.REDIS_URL, stop: async () => {} };
  const executable = process.env.GARNET_SERVER_PATH;
  if (!executable || !fs.existsSync(executable)) {
    throw new Error("Set REDIS_URL to a running Redis-compatible server, or GARNET_SERVER_PATH to GarnetServer.");
  }
  const child = spawn(executable, ["--port", String(port), "--bind", "127.0.0.1"], { stdio: "ignore", windowsHide: true });
  const deadline = Date.now() + 20000;
  while (!(await portOpen(port))) {
    if (child.exitCode !== null) throw new Error(`GarnetServer exited with code ${child.exitCode}.`);
    if (Date.now() > deadline) throw new Error("GarnetServer did not start.");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return {
    url: `redis://127.0.0.1:${port}`,
    stop: async () => {
      if (child.exitCode !== null) return;
      await new Promise((resolve) => { child.once("exit", resolve); child.kill(); });
    },
  };
}

/** Applies the Drizzle migrations in apps/api/drizzle. */
export async function migrateDatabase(url) {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: path.join(apiRoot, "drizzle") });
  } finally {
    await client.end();
  }
}
