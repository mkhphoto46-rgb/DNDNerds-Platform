import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuthUser } from "../auth/session.js";
import { db } from "../db/client.js";
import {
  sellerNotificationConnections, sellerNotificationPairingChallenges, storeMembers, users,
} from "../db/schema.js";
import {
  encryptPeerId, fingerprintPeerId, hashPairToken, newPairToken, secureCompare,
  verifiedTelegramPrivateStart, type ExternalNotificationChannel,
} from "../notifications/connection-security.js";

const storeParam = z.object({ storeId: z.string().uuid() });
const channelParam = storeParam.extend({ channel: z.enum(["TELEGRAM", "BALE"]) });
const ACCEPTED_ROLES = ["OWNER", "MANAGER", "ORDER_MANAGER"] as const;

async function storeActor(request: FastifyRequest, reply: FastifyReply, storeId: string): Promise<string | null> {
  const actor = await requireAuthUser(request);
  if (!actor) {
    reply.code(401).send({ error: { code: "UNAUTHORIZED" } });
    return null;
  }
  const [row] = await db.select({ role: storeMembers.role }).from(storeMembers)
    .where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, actor.id))).limit(1);
  if (!row || !ACCEPTED_ROLES.includes(row.role as typeof ACCEPTED_ROLES[number])) {
    reply.code(403).send({ error: { code: "STORE_FORBIDDEN" } });
    return null;
  }
  return actor.id;
}

function telegramSetupReady(): boolean {
  const name = process.env.NOTIFICATION_TELEGRAM_BOT_USERNAME ?? "";
  return process.env.DND_ENABLE_TELEGRAM_PAIRING === "true"
    && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name)
    && /^[0-9a-fA-F]{64}$/.test(process.env.NOTIFICATION_DESTINATION_KEY_HEX ?? "")
    && /^[A-Za-z0-9_-]{32,256}$/.test(process.env.NOTIFICATION_TELEGRAM_WEBHOOK_SECRET ?? "");
}

/** This function is callable only AFTER an ingress adapter has verified an authentic bot update. */
export async function completePairingFromTrustedPrivateBotUpdate(input: {
  channel: ExternalNotificationChannel;
  token: string;
  privatePeerId: string;
}): Promise<boolean> {
  // Fail closed if the encryption key has not been provisioned.
  const ciphertext = encryptPeerId(input.privatePeerId);
  const tokenHash = hashPairToken(input.token);
  const fingerprint = fingerprintPeerId(input.channel, input.privatePeerId);
  const result = await db.transaction(async tx => {
    const [initial] = await tx.select({ storeId: sellerNotificationPairingChallenges.storeId,
      userId: sellerNotificationPairingChallenges.userId }).from(sellerNotificationPairingChallenges).where(and(
      eq(sellerNotificationPairingChallenges.tokenHash, tokenHash),
      eq(sellerNotificationPairingChallenges.channel, input.channel),
    )).limit(1);
    if (!initial) return false;
    const lockKey = `${initial.storeId}:${initial.userId}:${input.channel}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
    const [challenge] = await tx.select().from(sellerNotificationPairingChallenges).where(and(
      eq(sellerNotificationPairingChallenges.tokenHash, tokenHash),
      eq(sellerNotificationPairingChallenges.channel, input.channel),
    )).limit(1);
    if (!challenge || challenge.consumedAt || challenge.expiresAt.getTime() <= Date.now()) return false;
    const [member] = await tx.select({ role: storeMembers.role }).from(storeMembers).where(and(
      eq(storeMembers.storeId, challenge.storeId), eq(storeMembers.userId, challenge.userId),
    )).limit(1);
    const [user] = await tx.select({ status: users.status }).from(users)
      .where(eq(users.id, challenge.userId)).limit(1);
    if (!member || !ACCEPTED_ROLES.includes(member.role as typeof ACCEPTED_ROLES[number])
       || user?.status !== "ACTIVE") return false;
    const now = new Date();
    await tx.update(sellerNotificationPairingChallenges).set({ consumedAt: now })
      .where(eq(sellerNotificationPairingChallenges.id, challenge.id));
    await tx.insert(sellerNotificationConnections).values({
      storeId: challenge.storeId, userId: challenge.userId, channel: input.channel,
      status: "CONNECTED", peerCiphertext: ciphertext, peerFingerprint: fingerprint,
      verifiedBy: input.channel === "TELEGRAM" ? "TELEGRAM_AUTHENTIC_WEBHOOK" : "BALE_TRUSTED_INGRESS",
      connectedAt: now, disconnectedAt: null, updatedAt: now,
    }).onConflictDoUpdate({
      target: [sellerNotificationConnections.storeId, sellerNotificationConnections.userId, sellerNotificationConnections.channel],
      set: { status: "CONNECTED", peerCiphertext: ciphertext, peerFingerprint: fingerprint,
        verifiedBy: input.channel === "TELEGRAM" ? "TELEGRAM_AUTHENTIC_WEBHOOK" : "BALE_TRUSTED_INGRESS",
        connectedAt: now, disconnectedAt: null, updatedAt: now },
    });
    return true;
  });
  return result;
}

export async function registerSellerNotificationConnectionRoutes(app: FastifyInstance) {
  app.get("/api/v1/seller/stores/:storeId/notification-connections", async (request, reply) => {
    const parsed = storeParam.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR" } });
    const userId = await storeActor(request, reply, parsed.data.storeId);
    if (!userId) return;
    const rows = await db.select({
      channel: sellerNotificationConnections.channel, status: sellerNotificationConnections.status,
      connectedAt: sellerNotificationConnections.connectedAt, updatedAt: sellerNotificationConnections.updatedAt,
    }).from(sellerNotificationConnections).where(and(
      eq(sellerNotificationConnections.storeId, parsed.data.storeId),
      eq(sellerNotificationConnections.userId, userId),
    ));
    const byChannel = new Map(rows.map(r => [r.channel, r]));
    return { storeId: parsed.data.storeId, channels: (["TELEGRAM", "BALE"] as const).map(channel => ({
      channel, connected: byChannel.get(channel)?.status === "CONNECTED",
      connectedAt: byChannel.get(channel)?.connectedAt ?? null,
      setupAvailable: channel === "TELEGRAM" && telegramSetupReady(),
      deliveryAvailable: false,
    })) };
  });

  app.post("/api/v1/seller/stores/:storeId/notification-connections/:channel/start", async (request, reply) => {
    const parsed = channelParam.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR" } });
    const userId = await storeActor(request, reply, parsed.data.storeId);
    if (!userId) return;
    // Bale pairing requires a separately authenticated polling adapter; do NOT trust arbitrary Bale webhook HTTP.
    if (parsed.data.channel === "BALE") return reply.code(503).send({ error: { code: "BALE_INGRESS_NOT_ENABLED" } });
    if (!telegramSetupReady()) return reply.code(503).send({ error: { code: "TELEGRAM_BOT_NOT_CONFIGURED" } });
    const token = newPairToken();
    const now = new Date();
    await db.transaction(async tx => {
      const lockKey = `${parsed.data.storeId}:${userId}:${parsed.data.channel}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      const recent = await tx.select({ id: sellerNotificationPairingChallenges.id })
        .from(sellerNotificationPairingChallenges).where(and(
          eq(sellerNotificationPairingChallenges.storeId, parsed.data.storeId),
          eq(sellerNotificationPairingChallenges.userId, userId),
          eq(sellerNotificationPairingChallenges.channel, parsed.data.channel),
          gt(sellerNotificationPairingChallenges.createdAt, new Date(now.getTime() - 10 * 60_000)),
        )).limit(5);
      if (recent.length >= 5) throw Object.assign(new Error("Pairing request rate limit"), { statusCode: 429 });
      await tx.update(sellerNotificationPairingChallenges).set({ consumedAt: now }).where(and(
        eq(sellerNotificationPairingChallenges.storeId, parsed.data.storeId),
        eq(sellerNotificationPairingChallenges.userId, userId),
        eq(sellerNotificationPairingChallenges.channel, parsed.data.channel),
        isNull(sellerNotificationPairingChallenges.consumedAt),
      ));
      await tx.insert(sellerNotificationPairingChallenges).values({
        storeId: parsed.data.storeId, userId, channel: parsed.data.channel,
        tokenHash: hashPairToken(token), expiresAt: new Date(now.getTime() + 10 * 60_000),
      });
    });
    return { channel: "TELEGRAM", expiresInSeconds: 600,
      deepLink: `https://t.me/${process.env.NOTIFICATION_TELEGRAM_BOT_USERNAME}?start=${token}`,
      note: "Open the link and press Start in a PRIVATE chat with the platform bot. No messages are sent by the platform during this phase." };
  });

  app.delete("/api/v1/seller/stores/:storeId/notification-connections/:channel", async (request, reply) => {
    const parsed = channelParam.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR" } });
    const userId = await storeActor(request, reply, parsed.data.storeId);
    if (!userId) return;
    const now = new Date();
    await db.transaction(async tx => {
      const lockKey = `${parsed.data.storeId}:${userId}:${parsed.data.channel}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      await tx.update(sellerNotificationPairingChallenges).set({ consumedAt: now }).where(and(
        eq(sellerNotificationPairingChallenges.storeId, parsed.data.storeId),
        eq(sellerNotificationPairingChallenges.userId, userId),
        eq(sellerNotificationPairingChallenges.channel, parsed.data.channel),
        isNull(sellerNotificationPairingChallenges.consumedAt),
      ));
      await tx.update(sellerNotificationConnections).set({ status: "DISCONNECTED", peerCiphertext: null,
        peerFingerprint: null, disconnectedAt: now, updatedAt: now }).where(and(
        eq(sellerNotificationConnections.storeId, parsed.data.storeId),
        eq(sellerNotificationConnections.userId, userId),
        eq(sellerNotificationConnections.channel, parsed.data.channel),
      ));
    });
    return { ok: true, channel: parsed.data.channel, connected: false };
  });

  // Telegram's Bot API sets this header from the server-side setWebhook(secret_token) configuration.
  // No bot token is ever accepted from a seller. No outbound messages or money operations occur.
  app.post("/api/v1/notification-bots/telegram/webhook", async (request, reply) => {
    if (!telegramSetupReady() || !secureCompare(
      request.headers["x-telegram-bot-api-secret-token"],
      process.env.NOTIFICATION_TELEGRAM_WEBHOOK_SECRET,
    )) return reply.code(403).send({ error: { code: "WEBHOOK_FORBIDDEN" } });
    const start = verifiedTelegramPrivateStart(request.body);
    if (!start) return { ok: true };
    await completePairingFromTrustedPrivateBotUpdate({ channel: "TELEGRAM", token: start.token, privatePeerId: start.peerId });
    return { ok: true };
  });
}
