import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuthUser } from "../auth/session.js";
import { messagePage } from "./social-message-page.js";
import { db } from "../db/client.js";
import {
  socialProfiles, socialFriendRequests, socialFriendships, socialBlocks,
  socialMessages,
} from "../db/schema.js";

const codeSchema = z.string().trim().toUpperCase().regex(/^DND-[A-F0-9]{24}$/);
const uuidSchema = z.string().uuid();
const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });
const requestSchema = z.object({ friendCode: codeSchema });
const dailyRequestLimit = 20;
const outstandingRequestLimit = 15;

function error(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } });
}
function sortedPair(a: string, b: string): [string,string] {
  return a < b ? [a, b] : [b, a];
}
function chatPair(a: string, b: string) {
  return or(and(eq(socialMessages.senderUserId, a), eq(socialMessages.receiverUserId, b)),
    and(eq(socialMessages.senderUserId, b), eq(socialMessages.receiverUserId, a)));
}
async function actor(request: FastifyRequest, reply: FastifyReply) {
  const auth = await requireAuthUser(request);
  if (!auth) { error(reply, 401, "AUTH_REQUIRED", "Authentication required."); return null; }
  return auth;
}
async function isBlocked(a: string, b: string) {
  const [row] = await db.select({ id: socialBlocks.blockerUserId })
    .from(socialBlocks).where(or(
      and(eq(socialBlocks.blockerUserId, a), eq(socialBlocks.blockedUserId, b)),
      and(eq(socialBlocks.blockerUserId, b), eq(socialBlocks.blockedUserId, a)),
    )).limit(1);
  return Boolean(row);
}
async function areFriends(a: string, b: string) {
  const [low, high] = sortedPair(a, b);
  const [row] = await db.select({ lower: socialFriendships.lowerUserId })
    .from(socialFriendships).where(and(eq(socialFriendships.lowerUserId, low), eq(socialFriendships.upperUserId, high))).limit(1);
  return Boolean(row);
}
async function authorizedFriends(a: string, b: string) {
  if (a === b) return false;
  if (await isBlocked(a, b)) return false;
  return areFriends(a, b);
}
async function publicCodes(ids: string[]) {
  if (!ids.length) return new Map<string,string>();
  const profiles = await db.select({ userId: socialProfiles.userId, friendCode: socialProfiles.friendCode })
    .from(socialProfiles).where(inArray(socialProfiles.userId, [...new Set(ids)]));
  return new Map(profiles.map(p => [p.userId, p.friendCode]));
}

export async function registerSocialRoutes(app: FastifyInstance) {
  // Explicit POST activation avoids unexpected writes on a GET request.
  app.post("/api/v1/social/me/activate", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    for (let i = 0; i < 3; i++) {
      const [existing] = await db.select({ friendCode: socialProfiles.friendCode })
        .from(socialProfiles).where(eq(socialProfiles.userId, user.id)).limit(1);
      if (existing) return { data: { friendCode: existing.friendCode } };
      const candidate = `DND-${randomBytes(12).toString("hex").toUpperCase()}`;
      await db.insert(socialProfiles).values({ userId: user.id, friendCode: candidate }).onConflictDoNothing();
    }
    const [profile] = await db.select({ friendCode: socialProfiles.friendCode })
      .from(socialProfiles).where(eq(socialProfiles.userId, user.id)).limit(1);
    if (!profile) return error(reply, 503, "PROFILE_UNAVAILABLE", "Unable to create Friend ID.");
    return { data: profile };
  });
  app.get("/api/v1/social/me", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const [profile] = await db.select({ friendCode: socialProfiles.friendCode })
      .from(socialProfiles).where(eq(socialProfiles.userId, user.id)).limit(1);
    return { data: { friendCode: profile?.friendCode ?? null } };
  });
  app.get("/api/v1/social/requests", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const rows = await db.select({ id: socialFriendRequests.id,
      senderUserId: socialFriendRequests.senderUserId, receiverUserId: socialFriendRequests.receiverUserId,
      status: socialFriendRequests.status, createdAt: socialFriendRequests.createdAt,
    }).from(socialFriendRequests).where(and(
      or(eq(socialFriendRequests.senderUserId, user.id), eq(socialFriendRequests.receiverUserId, user.id)),
      eq(socialFriendRequests.status, "PENDING"),
    )).orderBy(desc(socialFriendRequests.createdAt)).limit(100);
    const codes = await publicCodes(rows.map(r => r.senderUserId === user.id ? r.receiverUserId : r.senderUserId));
    const view = (r: (typeof rows)[number]) => ({ id: r.id,
      friendCode: codes.get(r.senderUserId === user.id ? r.receiverUserId : r.senderUserId) ?? null,
      createdAt: r.createdAt,
    });
    return { data: {
      incoming: rows.filter(r => r.receiverUserId === user.id).map(view),
      outgoing: rows.filter(r => r.senderUserId === user.id).map(view),
    } };
  });
  app.post("/api/v1/social/requests", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) return error(reply, 400, "INVALID_FRIEND_CODE", "Friend ID is invalid.");
    const [target] = await db.select({ userId: socialProfiles.userId })
      .from(socialProfiles).where(eq(socialProfiles.friendCode, parsed.data.friendCode)).limit(1);
    if (!target) return error(reply, 404, "FRIEND_NOT_FOUND", "Friend ID was not found.");
    if (target.userId === user.id) return error(reply, 400, "SELF_REQUEST", "You cannot invite yourself.");
    if (await isBlocked(user.id, target.userId)) return error(reply, 403, "SOCIAL_BLOCKED", "Invitation unavailable.");
    if (await areFriends(user.id, target.userId)) return error(reply, 409, "ALREADY_FRIENDS", "Already friends.");
    const recent = await db.select({ id: socialFriendRequests.id })
      .from(socialFriendRequests).where(and(eq(socialFriendRequests.senderUserId, user.id),
        gt(socialFriendRequests.createdAt, new Date(Date.now() - 24*60*60*1000)))).limit(dailyRequestLimit);
    if (recent.length >= dailyRequestLimit) return error(reply, 429, "INVITE_LIMIT", "Daily invitation limit reached.");
    const outstanding = await db.select({ id: socialFriendRequests.id })
      .from(socialFriendRequests).where(and(eq(socialFriendRequests.senderUserId, user.id),
        eq(socialFriendRequests.status, "PENDING"))).limit(outstandingRequestLimit);
    if (outstanding.length >= outstandingRequestLimit) return error(reply, 429, "INVITE_LIMIT", "Too many pending invitations.");
    const [opposite] = await db.select({ id: socialFriendRequests.id })
      .from(socialFriendRequests).where(and(eq(socialFriendRequests.senderUserId, target.userId),
        eq(socialFriendRequests.receiverUserId, user.id), eq(socialFriendRequests.status, "PENDING"))).limit(1);
    if (opposite) return error(reply, 409, "INCOMING_EXISTS", "Accept the existing incoming request.");
    const [prior] = await db.select({ id: socialFriendRequests.id, status: socialFriendRequests.status,
      createdAt: socialFriendRequests.createdAt })
      .from(socialFriendRequests).where(and(eq(socialFriendRequests.senderUserId, user.id),
        eq(socialFriendRequests.receiverUserId, target.userId))).limit(1);
    if (prior?.status === "PENDING") return error(reply, 409, "REQUEST_EXISTS", "Invitation already pending.");
    if (prior && Date.now() - prior.createdAt.getTime() < 7*24*60*60*1000)
      return error(reply, 429, "INVITE_COOLDOWN", "Wait before resending this invitation.");
    if (prior) {
      const [updated] = await db.update(socialFriendRequests).set({ status: "PENDING", createdAt: new Date(), respondedAt: null })
        .where(and(eq(socialFriendRequests.id, prior.id), eq(socialFriendRequests.senderUserId, user.id),
          eq(socialFriendRequests.status, "DECLINED"))).returning({ id: socialFriendRequests.id });
      if (!updated) return error(reply, 409, "REQUEST_EXISTS", "Invitation cannot be resent.");
      return reply.code(201).send({ data: { id: updated.id } });
    }
    const [created] = await db.insert(socialFriendRequests).values({ senderUserId: user.id, receiverUserId: target.userId })
      .onConflictDoNothing().returning({ id: socialFriendRequests.id });
    if (!created) return error(reply, 409, "REQUEST_EXISTS", "Invitation already exists.");
    return reply.code(201).send({ data: { id: created.id } });
  });
  app.post<{ Params: { requestId: string } }>("/api/v1/social/requests/:requestId/accept", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    if (!uuidSchema.safeParse(request.params.requestId).success) return error(reply, 400, "INVALID_ID", "Invalid request ID.");
    const result = await db.transaction(async tx => {
      const [row] = await tx.select({ senderUserId: socialFriendRequests.senderUserId })
        .from(socialFriendRequests).where(and(eq(socialFriendRequests.id, request.params.requestId),
          eq(socialFriendRequests.receiverUserId, user.id), eq(socialFriendRequests.status, "PENDING"))).limit(1);
      if (!row) return "not_found";
      const [blocked] = await tx.select({ id: socialBlocks.blockerUserId }).from(socialBlocks).where(or(
        and(eq(socialBlocks.blockerUserId, row.senderUserId), eq(socialBlocks.blockedUserId, user.id)),
        and(eq(socialBlocks.blockerUserId, user.id), eq(socialBlocks.blockedUserId, row.senderUserId)))).limit(1);
      if (blocked) return "blocked";
      const [updated] = await tx.update(socialFriendRequests).set({ status: "ACCEPTED", respondedAt: new Date() })
        .where(and(eq(socialFriendRequests.id, request.params.requestId),
          eq(socialFriendRequests.receiverUserId, user.id), eq(socialFriendRequests.status, "PENDING")))
        .returning({ id: socialFriendRequests.id });
      if (!updated) return "not_found";
      const [low, high] = sortedPair(user.id, row.senderUserId);
      await tx.insert(socialFriendships).values({ lowerUserId: low, upperUserId: high }).onConflictDoNothing();
      return "ok";
    });
    if (result !== "ok") return error(reply, result === "blocked" ? 403 : 404,
      result === "blocked" ? "SOCIAL_BLOCKED" : "REQUEST_NOT_FOUND", "Request is unavailable.");
    return { data: { status: "ACCEPTED" } };
  });
  app.post<{ Params: { requestId: string } }>("/api/v1/social/requests/:requestId/decline", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    if (!uuidSchema.safeParse(request.params.requestId).success) return error(reply, 400, "INVALID_ID", "Invalid request ID.");
    const [updated] = await db.update(socialFriendRequests).set({ status: "DECLINED", respondedAt: new Date() })
      .where(and(eq(socialFriendRequests.id, request.params.requestId),
        eq(socialFriendRequests.receiverUserId, user.id), eq(socialFriendRequests.status, "PENDING")))
      .returning({ id: socialFriendRequests.id });
    if (!updated) return error(reply, 404, "REQUEST_NOT_FOUND", "Request is unavailable.");
    return { data: { status: "DECLINED" } };
  });
  app.get("/api/v1/social/friends", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const rows = await db.select({ lowerUserId: socialFriendships.lowerUserId,
      upperUserId: socialFriendships.upperUserId, createdAt: socialFriendships.createdAt })
      .from(socialFriendships).where(or(eq(socialFriendships.lowerUserId, user.id),
        eq(socialFriendships.upperUserId, user.id))).orderBy(desc(socialFriendships.createdAt)).limit(100);
    const others = rows.map(r => r.lowerUserId === user.id ? r.upperUserId : r.lowerUserId);
    const codes = await publicCodes(others);
    return { data: rows.map(r => {
      const otherId = r.lowerUserId === user.id ? r.upperUserId : r.lowerUserId;
      return { userId: otherId, friendCode: codes.get(otherId) ?? null, since: r.createdAt };
    }) };
  });
  app.post<{ Params: { userId: string } }>("/api/v1/social/friends/:userId/remove", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const target = request.params.userId;
    if (!uuidSchema.safeParse(target).success || target === user.id) return error(reply, 400, "INVALID_ID", "Invalid user ID.");
    const [low, high] = sortedPair(user.id, target);
    await db.transaction(async tx => {
      await tx.delete(socialFriendships).where(and(eq(socialFriendships.lowerUserId, low), eq(socialFriendships.upperUserId, high)));
      await tx.delete(socialFriendRequests).where(or(
        and(eq(socialFriendRequests.senderUserId, user.id), eq(socialFriendRequests.receiverUserId, target)),
        and(eq(socialFriendRequests.senderUserId, target), eq(socialFriendRequests.receiverUserId, user.id))));
    });
    return { data: { removed: true } };
  });
  app.post<{ Params: { userId: string } }>("/api/v1/social/blocks/:userId", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const target = request.params.userId;
    if (!uuidSchema.safeParse(target).success || target === user.id) return error(reply, 400, "INVALID_ID", "Invalid user ID.");
    const [profile] = await db.select({ userId: socialProfiles.userId })
      .from(socialProfiles).where(eq(socialProfiles.userId, target)).limit(1);
    if (!profile) return error(reply, 404, "USER_NOT_FOUND", "User not found.");
    const [low, high] = sortedPair(user.id, target);
    await db.transaction(async tx => {
      await tx.insert(socialBlocks).values({ blockerUserId: user.id, blockedUserId: target }).onConflictDoNothing();
      await tx.delete(socialFriendships).where(and(eq(socialFriendships.lowerUserId, low), eq(socialFriendships.upperUserId, high)));
      await tx.delete(socialFriendRequests).where(or(
        and(eq(socialFriendRequests.senderUserId, user.id), eq(socialFriendRequests.receiverUserId, target)),
        and(eq(socialFriendRequests.senderUserId, target), eq(socialFriendRequests.receiverUserId, user.id))));
    });
    return { data: { blocked: true } };
  });
  app.post<{ Params: { userId: string } }>("/api/v1/social/blocks/:userId/unblock", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const target = request.params.userId;
    if (!uuidSchema.safeParse(target).success || target === user.id) return error(reply, 400, "INVALID_ID", "Invalid user ID.");
    await db.delete(socialBlocks).where(and(eq(socialBlocks.blockerUserId, user.id), eq(socialBlocks.blockedUserId, target)));
    return { data: { unblocked: true } };
  });
  app.get<{ Params: { userId: string }; Querystring: { beforeId?: string } }>(
    "/api/v1/social/friends/:userId/messages", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const target = request.params.userId;
    if (!uuidSchema.safeParse(target).success) return error(reply, 400, "INVALID_ID", "Invalid user ID.");
    if (!(await authorizedFriends(user.id, target))) return error(reply, 403, "NOT_FRIENDS", "Chat available for friends only.");
    const beforeId = request.query?.beforeId;
    let cursor: { id: string; createdAt: Date } | undefined;
    if (beforeId) {
      if (!uuidSchema.safeParse(beforeId).success) return error(reply, 400, "INVALID_CURSOR", "Invalid cursor.");
      const [record] = await db.select({ id: socialMessages.id, createdAt: socialMessages.createdAt })
        .from(socialMessages).where(and(eq(socialMessages.id, beforeId), chatPair(user.id, target))).limit(1);
      if (!record) return error(reply, 400, "INVALID_CURSOR", "Cursor does not belong to this conversation.");
      cursor = record;
    }
    const rows = await db.select({ id: socialMessages.id, senderUserId: socialMessages.senderUserId,
      body: socialMessages.body, createdAt: socialMessages.createdAt })
      .from(socialMessages).where(and(chatPair(user.id, target),
        cursor ? or(lt(socialMessages.createdAt, cursor.createdAt), and(
          eq(socialMessages.createdAt, cursor.createdAt), lt(socialMessages.id, cursor.id))) : undefined))
      .orderBy(desc(socialMessages.createdAt), desc(socialMessages.id)).limit(50);
    return messagePage(rows);
  });
  app.post<{ Params: { userId: string } }>("/api/v1/social/friends/:userId/messages", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const target = request.params.userId;
    if (!uuidSchema.safeParse(target).success) return error(reply, 400, "INVALID_ID", "Invalid user ID.");
    const parsed = messageSchema.safeParse(request.body);
    if (!parsed.success || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(parsed.data?.body ?? ""))
      return error(reply, 400, "INVALID_MESSAGE", "Text must contain 1 to 2000 characters.");
    if (!(await authorizedFriends(user.id, target))) return error(reply, 403, "NOT_FRIENDS", "Chat available for friends only.");
    // Moderate basic unsolicited flooding. All messages remain text: link rendering belongs to the client.
    const recent = await db.select({ id: socialMessages.id }).from(socialMessages).where(and(
      eq(socialMessages.senderUserId, user.id), gt(socialMessages.createdAt, new Date(Date.now()-60_000))))
      .limit(30);
    if (recent.length >= 30) return error(reply, 429, "MESSAGE_LIMIT", "Please slow down.");
    const [created] = await db.insert(socialMessages).values({ senderUserId: user.id,
      receiverUserId: target, body: parsed.data.body })
      .returning({ id: socialMessages.id, createdAt: socialMessages.createdAt });
    if (!created) return error(reply, 503, "MESSAGE_UNAVAILABLE", "Message could not be saved.");
    return reply.code(201).send({ data: { id: created.id, senderUserId: user.id,
      body: parsed.data.body, createdAt: created.createdAt } });
  });
}
