import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuthUser } from "../auth/session.js";
import { db } from "../db/client.js";
import { sellerNotificationOutbox, sellerNotificationPreferences, storeMembers } from "../db/schema.js";
import {
  NOTIFICATION_CHANNELS, NOTIFICATION_EVENTS, channelCanDeliver,
  defaultNotificationEnabled,
} from "../notifications/policy.js";

const storeParams = z.object({ storeId: z.string().uuid() });
const notificationParams = storeParams.extend({ notificationId: z.string().uuid() });
const updatePreferenceBody = z.object({
  eventType: z.enum(NOTIFICATION_EVENTS),
  channel: z.enum(NOTIFICATION_CHANNELS),
  enabled: z.boolean(),
});

async function authorize(
  request: FastifyRequest, reply: FastifyReply, storeId: string,
  requireManager = false,
): Promise<{ userId: string } | null> {
  const user = await requireAuthUser(request);
  if (!user) {
    reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Authentication required." } });
    return null;
  }
  const [member] = await db.select({ role: storeMembers.role }).from(storeMembers)
    .where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, user.id))).limit(1);
  if (!member || (requireManager && member.role !== "OWNER" && member.role !== "MANAGER")) {
    reply.code(403).send({ error: { code: "STORE_FORBIDDEN", message: "Access denied for this store." } });
    return null;
  }
  return { userId: user.id };
}

export async function registerSellerNotificationRoutes(app: FastifyInstance) {
  app.get("/api/v1/seller/stores/:storeId/notification-preferences", async (request, reply) => {
    const params = storeParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR" } });
    if (!await authorize(request, reply, params.data.storeId)) return;
    const rows = await db.select().from(sellerNotificationPreferences)
      .where(eq(sellerNotificationPreferences.storeId, params.data.storeId));
    const lookup = new Map(rows.map(row => [`${row.eventType}:${row.channel}`, row.enabled]));
    return {
      storeId: params.data.storeId,
      preferences: NOTIFICATION_EVENTS.flatMap(eventType => NOTIFICATION_CHANNELS.map(channel => ({
        eventType, channel,
        enabled: lookup.get(`${eventType}:${channel}`) ?? defaultNotificationEnabled(eventType, channel),
        deliveryAvailable: channelCanDeliver(channel),
      }))),
      note: "External channel connections and actual sends are unavailable in J2O-A",
    };
  });

  app.put("/api/v1/seller/stores/:storeId/notification-preferences", async (request, reply) => {
    const params = storeParams.safeParse(request.params);
    const body = updatePreferenceBody.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR" } });
    const actor = await authorize(request, reply, params.data.storeId, true);
    if (!actor) return;
    await db.insert(sellerNotificationPreferences).values({
      storeId: params.data.storeId, eventType: body.data.eventType,
      channel: body.data.channel, enabled: body.data.enabled,
      updatedByUserId: actor.userId, updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [sellerNotificationPreferences.storeId, sellerNotificationPreferences.eventType, sellerNotificationPreferences.channel],
      set: { enabled: body.data.enabled, updatedByUserId: actor.userId, updatedAt: new Date() },
    });
    return { ok: true, ...body.data, deliveryAvailable: channelCanDeliver(body.data.channel),
      note: channelCanDeliver(body.data.channel) ? "In-app notifications configured" : "Preference saved; provider not yet connected" };
  });

  app.get("/api/v1/seller/stores/:storeId/notifications", async (request, reply) => {
    const params = storeParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR" } });
    const actor = await authorize(request, reply, params.data.storeId);
    if (!actor) return;
    const rows = await db.select({
      id: sellerNotificationOutbox.id,
      eventType: sellerNotificationOutbox.eventType,
      sellerOrderId: sellerNotificationOutbox.sellerOrderId,
      payload: sellerNotificationOutbox.payload,
      status: sellerNotificationOutbox.status,
      readAt: sellerNotificationOutbox.readAt,
      createdAt: sellerNotificationOutbox.createdAt,
    }).from(sellerNotificationOutbox).where(and(
      eq(sellerNotificationOutbox.storeId, params.data.storeId),
      eq(sellerNotificationOutbox.recipientUserId, actor.userId),
      eq(sellerNotificationOutbox.channel, "IN_APP"),
    )).orderBy(desc(sellerNotificationOutbox.createdAt)).limit(50);
    return { notifications: rows };
  });

  app.post("/api/v1/seller/stores/:storeId/notifications/:notificationId/read", async (request, reply) => {
    const params = notificationParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR" } });
    const actor = await authorize(request, reply, params.data.storeId);
    if (!actor) return;
    const updated = await db.update(sellerNotificationOutbox).set({ readAt: sql`COALESCE(${sellerNotificationOutbox.readAt}, NOW())` })
      .where(and(eq(sellerNotificationOutbox.id, params.data.notificationId),
        eq(sellerNotificationOutbox.storeId, params.data.storeId),
        eq(sellerNotificationOutbox.recipientUserId, actor.userId),
        eq(sellerNotificationOutbox.channel, "IN_APP")))
      .returning({ id: sellerNotificationOutbox.id });
    if (updated.length === 0) return reply.code(404).send({ error: { code: "NOTIFICATION_NOT_FOUND" } });
    return { ok: true };
  });
}
