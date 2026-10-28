import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuthUser } from "../auth/session.js";
import { db } from "../db/client.js";
import { dmProfiles, gameTableReviews, gameTables, playerCharacters, playerProfiles, users } from "../db/schema.js";
import { validProfileImage } from "./profile-image.js";

const base = "/api/v1/game-hub";
const uuid = z.string().uuid();
const image = (kind: "avatar" | "banner" | "portrait") => z.union([z.string(), z.null()]).refine(value => validProfileImage(value, kind), "تصویر باید WebP با حجم و ابعاد مجاز باشد.");
const dmInput = z.object({
  displayName: z.string().trim().min(2).max(100), bio: z.string().trim().max(1200),
  playStyle: z.string().trim().min(2).max(60), languages: z.string().trim().min(2).max(120),
  experienceYears: z.number().int().min(0).max(60), visible: z.boolean(),
  avatarData: image("avatar").optional(), bannerData: image("banner").optional(),
});
const characterInput = z.object({
  name: z.string().trim().min(2).max(80), className: z.string().trim().max(60),
  subclass: z.string().trim().max(80), race: z.string().trim().max(80),
  background: z.string().trim().max(120), level: z.number().int().min(1).max(20),
  currentHp: z.number().int().min(0).max(999), maxHp: z.number().int().min(1).max(999),
  description: z.string().trim().max(1200), story: z.string().trim().max(3000),
  portraitData: image("portrait").optional(), public: z.boolean(),
}).refine(value => value.currentHp <= value.maxHp, "HP فعلی نباید از حداکثر بیشتر باشد.");

async function authenticated(request: FastifyRequest, reply: { code: (status: number) => { send: (body: unknown) => unknown } }) {
  const user = await requireAuthUser(request);
  if (!user) reply.code(401).send({ error: { message: "برای ادامه وارد حساب خود شوید." } });
  return user;
}

function invalid(reply: { code: (status: number) => { send: (body: unknown) => unknown } }) {
  return reply.code(400).send({ error: { message: "اطلاعات صفحه یا تصویر معتبر نیست." } });
}

export async function registerProfilePagesRoutes(app: FastifyInstance) {
  const playerInput = z.object({ displayName: z.string().trim().min(2).max(100), bio: z.string().trim().max(1200), avatarData: image("avatar").optional(), bannerData: image("banner").optional() });
  app.get(`${base}/players/me/page`, async (request, reply) => {
    const user = await authenticated(request, reply); if (!user) return;
    const [profile] = await db.select().from(playerProfiles).where(eq(playerProfiles.userId, user.id)).limit(1);
    return { data: profile ?? { userId: user.id, displayName: user.username ?? "بازیکن", bio: "", avatarData: null, bannerData: null } };
  });
  app.put(`${base}/players/me/page`, async (request, reply) => {
    const user = await authenticated(request, reply); if (!user) return;
    const parsed = playerInput.safeParse(request.body); if (!parsed.success) return invalid(reply);
    const [profile] = await db.insert(playerProfiles).values({ userId: user.id, ...parsed.data }).onConflictDoUpdate({ target: playerProfiles.userId, set: { ...parsed.data, updatedAt: new Date() } }).returning();
    return { data: profile };
  });

  app.get(`${base}/dms/me/page`, async (request, reply) => {
    const user = await authenticated(request, reply); if (!user) return;
    const [profile] = await db.select().from(dmProfiles).where(eq(dmProfiles.userId, user.id)).limit(1);
    return { data: profile ?? null };
  });

  app.post(`${base}/dms/me/activate`, async (request, reply) => {
    const user = await authenticated(request, reply); if (!user) return;
    const fallback = user.username ?? user.email.split("@")[0] ?? "DM";
    await db.insert(dmProfiles).values({ userId: user.id, displayName: fallback.length >= 2 ? fallback.slice(0, 100) : "DM" }).onConflictDoNothing();
    const [profile] = await db.select().from(dmProfiles).where(eq(dmProfiles.userId, user.id)).limit(1);
    return { data: profile };
  });

  app.put(`${base}/dms/me/page`, async (request, reply) => {
    const user = await authenticated(request, reply); if (!user) return;
    const parsed = dmInput.safeParse(request.body); if (!parsed.success) return invalid(reply);
    const [profile] = await db.insert(dmProfiles).values({ userId: user.id, ...parsed.data })
      .onConflictDoUpdate({ target: dmProfiles.userId, set: { ...parsed.data, updatedAt: new Date() } }).returning();
    return { data: profile };
  });

  app.get<{ Params: { userId: string } }>(`${base}/dms/:userId/page`, async (request, reply) => {
    const parsed = uuid.safeParse(request.params.userId); if (!parsed.success) return invalid(reply);
    const [profile] = await db.select({ profile: dmProfiles }).from(dmProfiles).innerJoin(users, eq(dmProfiles.userId, users.id)).where(and(eq(dmProfiles.userId, parsed.data), eq(dmProfiles.visible, true), eq(users.status, "ACTIVE"))).limit(1);
    if (!profile) return reply.code(404).send({ error: { message: "صفحهٔ DM پیدا نشد." } });
    const [reviews, tables, ratingRows] = await Promise.all([
      db.select({ id: gameTableReviews.id, rating: gameTableReviews.rating, comment: gameTableReviews.comment, createdAt: gameTableReviews.createdAt,
        reviewerUserId: gameTableReviews.reviewerUserId, reviewerName: users.username, tableId: gameTables.id, tableTitle: gameTables.title })
        .from(gameTableReviews).innerJoin(gameTables, eq(gameTableReviews.tableId, gameTables.id))
        .innerJoin(users, eq(gameTableReviews.reviewerUserId, users.id))
        .where(and(eq(gameTables.hostUserId, profile.profile.userId), eq(gameTables.visibility, "PUBLIC"), inArray(gameTables.status, ["PUBLISHED", "CLOSED"])))
        .orderBy(desc(gameTableReviews.createdAt)).limit(100),
      db.select({ id: gameTables.id, title: gameTables.title, status: gameTables.status, system: gameTables.system, levelRange: gameTables.levelRange, description: gameTables.description, genres: gameTables.genres, imageData: gameTables.imageData })
        .from(gameTables).where(and(eq(gameTables.hostUserId, profile.profile.userId), eq(gameTables.visibility, "PUBLIC"), inArray(gameTables.status, ["PUBLISHED", "CLOSED"])))
        .orderBy(desc(gameTables.createdAt)).limit(30),
      db.select({ average: sql<number>`round(avg(${gameTableReviews.rating})::numeric, 1)::float`, count: sql<number>`count(*)::int` })
        .from(gameTableReviews).innerJoin(gameTables, eq(gameTableReviews.tableId, gameTables.id))
        .where(and(eq(gameTables.hostUserId, profile.profile.userId), eq(gameTables.visibility, "PUBLIC"), inArray(gameTables.status, ["PUBLISHED", "CLOSED"]))),
    ]);
    return { data: { profile: profile.profile, rating: ratingRows[0]?.average ?? null, reviewCount: ratingRows[0]?.count ?? 0, reviews: reviews.map(review => ({ ...review, reviewerName: review.reviewerName ?? `بازیکن ${review.reviewerUserId.slice(0, 6)}` })), tables } };
  });

  app.get(`${base}/characters/me`, async (request, reply) => {
    const user = await authenticated(request, reply); if (!user) return;
    return { data: await db.select().from(playerCharacters).where(eq(playerCharacters.userId, user.id)).orderBy(desc(playerCharacters.createdAt)) };
  });

  app.post(`${base}/characters`, async (request, reply) => {
    const user = await authenticated(request, reply); if (!user) return;
    const parsed = characterInput.safeParse(request.body); if (!parsed.success) return invalid(reply);
    const row = await db.transaction(async tx => {
      await tx.execute(sql`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`);
      const [total] = await tx.select({ count: sql<number>`count(*)::int` }).from(playerCharacters).where(eq(playerCharacters.userId, user.id));
      if ((total?.count ?? 0) >= 3) return null;
      const [created] = await tx.insert(playerCharacters).values({ userId: user.id, ...parsed.data }).returning();
      return created;
    });
    if (!row) return reply.code(409).send({ error: { message: "برای هر حساب حداکثر ۳ کاراکتر می‌توان ساخت." } });
    return reply.code(201).send({ data: row });
  });

  app.put<{ Params: { characterId: string } }>(`${base}/characters/:characterId`, async (request, reply) => {
    const user = await authenticated(request, reply); if (!user) return;
    const key = uuid.safeParse(request.params.characterId), parsed = characterInput.safeParse(request.body);
    if (!key.success || !parsed.success) return invalid(reply);
    const [row] = await db.update(playerCharacters).set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(playerCharacters.id, key.data), eq(playerCharacters.userId, user.id))).returning();
    if (!row) return reply.code(404).send({ error: { message: "کاراکتر پیدا نشد." } });
    return { data: row };
  });

  app.delete<{ Params: { characterId: string } }>(`${base}/characters/:characterId`, async (request, reply) => {
    const user = await authenticated(request, reply); if (!user) return;
    const key = uuid.safeParse(request.params.characterId); if (!key.success) return invalid(reply);
    const [row] = await db.delete(playerCharacters).where(and(eq(playerCharacters.id, key.data), eq(playerCharacters.userId, user.id))).returning({ id: playerCharacters.id });
    if (!row) return reply.code(404).send({ error: { message: "کاراکتر پیدا نشد." } });
    return { data: row };
  });

  app.get<{ Params: { userId: string } }>(`${base}/players/:userId/page`, async (request, reply) => {
    const key = uuid.safeParse(request.params.userId); if (!key.success) return invalid(reply);
    const [player] = await db.select({ id: users.id, username: users.username, status: users.status }).from(users).where(eq(users.id, key.data)).limit(1);
    if (!player || player.status !== "ACTIVE") return reply.code(404).send({ error: { message: "صفحهٔ بازیکن پیدا نشد." } });
    const characters = await db.select().from(playerCharacters).where(and(eq(playerCharacters.userId, key.data), eq(playerCharacters.public, true))).orderBy(desc(playerCharacters.createdAt));
    const [profile] = await db.select().from(playerProfiles).where(eq(playerProfiles.userId, key.data)).limit(1);
    const [dm] = await db.select({ userId: dmProfiles.userId }).from(dmProfiles).where(and(eq(dmProfiles.userId, key.data), eq(dmProfiles.visible, true))).limit(1);
    return { data: { player: { id: player.id, name: profile?.displayName ?? player.username ?? `بازیکن ${player.id.slice(0, 6)}`, bio: profile?.bio ?? "", avatarData: profile?.avatarData ?? null, bannerData: profile?.bannerData ?? null, dmPage: Boolean(dm) }, characters } };
  });
}
