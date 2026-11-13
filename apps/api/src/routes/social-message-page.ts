import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

export function sendMessagePage<T extends { id: string }>(
  rows: T[], request: FastifyRequest, reply: FastifyReply,
) {
  const page = messagePage(rows);
  const etag = '"' + createHash("sha256").update(JSON.stringify(page)).digest("base64url") + '"';
  reply.header("Cache-Control", "private, no-store").header("ETag", etag);
  if (request.headers["if-none-match"] === etag) return reply.code(304).send();
  return page;
}

export function messagePage<T extends { id: string }>(newestFirst: T[], pageSize = 50) {
  const nextBeforeId = newestFirst.length === pageSize
    ? newestFirst[newestFirst.length - 1]?.id ?? null
    : null;
  return { data: newestFirst.reverse(), nextBeforeId };
}
