import "dotenv/config";

import { z } from "zod";

const schema = z.object({
  API_RATE_LIMIT_MAX: z.coerce.number().int().min(60).max(1_000_000).default(180),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  API_HOST: z
    .string()
    .default("127.0.0.1"),

  API_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(4100),

  WEB_ORIGIN: z
    .string()
    .url()
    .default("http://localhost:3100"),

  MARKETPLACE_DEFAULT_COMMISSION_BPS: z.coerce
    .number()
    .int()
    .min(0)
    .max(10000)
    .default(500),

  DATABASE_URL: z
    .string()
    .min(1),
});

export const config = schema.parse(process.env);