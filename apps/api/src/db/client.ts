import postgres from "postgres";

import {
  drizzle,
} from "drizzle-orm/postgres-js";

import {
  config,
} from "../config";

export const sqlClient =
  postgres(
    config.DATABASE_URL,
    {
      max: 10,
      prepare: false,
    },
  );

export const db =
  drizzle(sqlClient);