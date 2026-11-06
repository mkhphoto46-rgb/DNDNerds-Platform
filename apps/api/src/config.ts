import "dotenv/config";

import { z } from "zod";

/**
 * Which proxies may set the client address (X-Forwarded-For). Default "loopback":
 * nginx and the website's server-side proxy run on the same host. "false" turns
 * it off, a number trusts that many hops, otherwise a comma list of addresses/CIDRs.
 */
export function parseTrustProxy(value: string | undefined): boolean | string | ((address: string, hop: number) => boolean) {
  const text = (value ?? "").trim();
  if (!text) return "loopback";
  if (text === "false") return false;
  if (text === "true") return true;
  if (/^\d+$/.test(text)) {
    const hops = Number(text);
    return (_address, hop) => hop < hops;
  }
  return text;
}

const schema = z.object({
  API_TRUST_PROXY: z.string().optional(),
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