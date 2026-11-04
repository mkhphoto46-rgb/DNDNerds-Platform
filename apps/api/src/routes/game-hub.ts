import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, desc, eq, ne, or, ilike, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { requireAuthUser } from "../auth/session.js";
import { db } from "../db/client.js";
import { arenaListings, arenaParticipants, dmProfiles, gameApplications, gameTableReviews, gameTableDeletions, gameTables, marketplaceAdminAuditLogs, sitePosts, users } from "../db/schema.js";
import { getAdmin, reauth } from "./admin.js";
import { canLaunchTable } from "./table-access.js";
import { createVttTicket } from "./vtt-ticket.js";
import { fetchVttTableStatuses } from "../integrations/vtt-table-status.js";
import { requestNativeVttInvite } from "../integrations/native-vtt-invite.js";
import { inviteBridgeError } from "../integrations/vtt-origin.js";

import { publicAccountId } from "../auth/public-identity.js";
import { validProfileImage } from "./profile-image.js";

import { discoveryFeedback, discoveryFeedbackList, registerDiscoveryFeedbackRoutes } from "./discovery-feedback.js";

const base = "/api/v1/game-hub";
const id = z.string().uuid();
const text = (max: number) => z.string().trim().max(max);
const profileInput = z.object({
  displayName: z.string().trim().min(2).max(100), bio: text(1200),
  playStyle: z.string().trim().min(2).max(60), languages: z.string().trim().min(2).max(120),
  experienceYears: z.number().int().min(0).max(60), visible: z.boolean(),
});
const tableInput = z.object({
  title: z.string().trim().min(3).max(120), description: text(2000),
  genres: z.array(z.enum(["فانتزی", "ماجراجویی", "وحشت", "معمایی", "علمی‌تخیلی", "حماسی", "طنز", "تاریخی", "نقش‌آفرینی", "نبردمحور"])).max(4).optional(),
  imageData: z.union([z.string(), z.null()]).refine(value => validProfileImage(value, "campaign")).optional(),
  system: z.string().trim().min(2).max(80), language: z.string().trim().min(2).max(60),
  playStyle: z.string().trim().min(2).max(60), levelRange: z.string().trim().min(1).max(60),
  schedule: z.string().trim().min(2).max(160), capacity: z.number().int().min(2).max(8),
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED"]),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
});
const arenaInput = z.object({ mode: z.enum(["1V1", "2V2", "3V3"]), title: z.string().trim().min(3).max(100), note: text(500) });
const moderationInput = z.object({ action: z.enum(["HIDE", "RESTORE"]), password: z.string().min(8).max(128), reason: z.string().trim().min(3).max(500) });
const postInput = z.object({ title: z.string().trim().min(5).max(160), summary: z.string().trim().min(10).max(500), body: z.string().trim().min(30).max(10000), status: z.enum(["DRAFT", "PUBLISHED"]) });

function invalid(reply: { code: (n: number) => { send: (v: unknown) => unknown } }) {
  return reply.code(400).send({ error: { message: "اطلاعات واردشده معتبر نیست." } });
}
async function auth(request: FastifyRequest, reply: { code: (n: number) => { send: (v: unknown) => unknown } }) {
  const user = await requireAuthUser(request);
  if (!user) reply.code(401).send({ error: { message: "برای ادامه وارد حساب خود شوید." } });
  return user;
}

function newInviteCode() { return randomBytes(9).toString("base64url").toUpperCase(); }
function inviteHash(code: string) { return createHash("sha256").update(code.trim().toUpperCase()).digest("hex"); }
function publicTable<T extends { inviteCodeHash?: string | null }>(table: T): Omit<T, "inviteCodeHash"> {
  const { inviteCodeHash: _hash, ...safe } = table;
  return safe;
}

async function reservePlayerSeat(tableId: string, userId: string, visibility: "PUBLIC" | "PRIVATE", requiredCodeHash?: string) {
  return db.transaction(async tx => {
    await tx.execute(sql`select id from game_tables where id = ${tableId} for update`);
    const [table] = await tx.select().from(gameTables).where(eq(gameTables.id, tableId)).limit(1);
    if (!table || table.status !== "PUBLISHED" || table.visibility !== visibility || (requiredCodeHash && table.inviteCodeHash !== requiredCodeHash)) return "closed";
    const [existing] = await tx.select().from(gameApplications).where(and(eq(gameApplications.tableId, tableId), eq(gameApplications.userId, userId))).limit(1);
    if (existing?.status === "ACCEPTED") return "accepted";
    const [count] = await tx.select({ total: sql<number>`count(*)::int` }).from(gameApplications).where(and(eq(gameApplications.tableId, tableId), eq(gameApplications.status, "ACCEPTED")));
    if ((count?.total ?? 0) >= table.capacity) return "full";
    if (existing) await tx.update(gameApplications).set({ status: "ACCEPTED", updatedAt: new Date() }).where(eq(gameApplications.id, existing.id));
    else await tx.insert(gameApplications).values({ tableId, userId, status: "ACCEPTED" });
    return "accepted";
  });
}

export async function registerGameHubRoutes(app: FastifyInstance) {
  await registerDiscoveryFeedbackRoutes(app);
  app.get(`${base}/posts`, async () => {
    const rows = await db.select({ id: sitePosts.id, title: sitePosts.title, summary: sitePosts.summary, body: sitePosts.body, createdAt: sitePosts.createdAt }).from(sitePosts).where(eq(sitePosts.status, "PUBLISHED")).orderBy(desc(sitePosts.createdAt)).limit(50);
    return { data: rows };
  });
  app.get(`${base}/admin/posts`, async (request, reply) => {
    const admin = await getAdmin(request); if (!admin) return reply.code(403).send({ error: { message: "دسترسی مدیر لازم است." } });
    return { data: await db.select().from(sitePosts).orderBy(desc(sitePosts.createdAt)).limit(100) };
  });
  app.post(`${base}/admin/posts`, async (request, reply) => {
    const parsed = postInput.extend({ password: z.string().min(8).max(128) }).safeParse(request.body);
    if (!parsed.success) return invalid(reply);
    const admin = await reauth(request, parsed.data.password); if (!admin || admin.role === "SUPPORT") return reply.code(403).send({ error: { message: "دسترسی یا رمز مدیر معتبر نیست." } });
    const { password: _password, ...fields } = parsed.data;
    const [row] = await db.insert(sitePosts).values({ ...fields, authorUserId: admin.userId }).returning();
    if (!row) throw new Error("Post insert failed");
    await db.insert(marketplaceAdminAuditLogs).values({ adminUserId: admin.userId, action: "CREATE_POST", entityType: "site_post", entityId: row.id, details: JSON.stringify({ title: row.title, status: row.status }) });
    return reply.code(201).send({ data: row });
  });
  app.put<{ Params: { postId: string } }>(`${base}/admin/posts/:postId`, async (request, reply) => {
    const key = id.safeParse(request.params.postId), parsed = postInput.extend({ password: z.string().min(8).max(128) }).safeParse(request.body);
    if (!key.success || !parsed.success) return invalid(reply);
    const admin = await reauth(request, parsed.data.password); if (!admin || admin.role === "SUPPORT") return reply.code(403).send({ error: { message: "دسترسی یا رمز مدیر معتبر نیست." } });
    const { password: _password, ...fields } = parsed.data;
    const [row] = await db.update(sitePosts).set({ ...fields, updatedAt: new Date() }).where(eq(sitePosts.id, key.data)).returning();
    if (!row) return reply.code(404).send({ error: { message: "خبر پیدا نشد." } });
    await db.insert(marketplaceAdminAuditLogs).values({ adminUserId: admin.userId, action: "UPDATE_POST", entityType: "site_post", entityId: row.id, details: JSON.stringify({ title: row.title, status: row.status }) });
    return { data: row };
  });
  app.get<{ Querystring: { q?: string; genre?: string } }>(`${base}/dms`, async (request, reply) => {
    const parsed = z.object({ q: z.string().trim().max(120).optional(), genre: z.string().max(40).optional() }).safeParse(request.query);
    if (!parsed.success) return invalid(reply);
    const query = parsed.data.q, genre = parsed.data.genre;
    const term = `%${query ?? ""}%`;
    const matchesCampaign = sql`EXISTS (SELECT 1 FROM game_tables t WHERE t.host_user_id = ${dmProfiles.userId} AND t.visibility = 'PUBLIC' AND t.status = 'PUBLISHED' AND (${!query} OR t.title ILIKE ${term} OR t.description ILIKE ${term} OR t.genres::text ILIKE ${term}) AND (${!genre} OR t.genres @> ${JSON.stringify(genre ? [genre] : [])}::jsonb))`;
    const publicIdMatch = sql`translate(rtrim(encode(substring(sha256(convert_to(${users.id}::text, 'UTF8')) from 1 for 9), 'base64'), '='), '+/', '-_') ILIKE ${term}`;
    const rows = await db.select({ username: users.username, userId: dmProfiles.userId, displayName: dmProfiles.displayName, bio: dmProfiles.bio, playStyle: dmProfiles.playStyle, languages: dmProfiles.languages, experienceYears: dmProfiles.experienceYears, avatarData: dmProfiles.avatarData, bannerData: dmProfiles.bannerData }).from(dmProfiles).innerJoin(users, eq(dmProfiles.userId, users.id)).where(and(eq(dmProfiles.visible, true), eq(users.status, "ACTIVE"), query ? or(ilike(dmProfiles.displayName, term), ilike(dmProfiles.bio, term), ilike(users.username, term), sql`${users.id}::text ILIKE ${term}`, publicIdMatch, matchesCampaign) : undefined, genre ? sql`EXISTS (SELECT 1 FROM game_tables t WHERE t.host_user_id = ${dmProfiles.userId} AND t.visibility = 'PUBLIC' AND t.status = 'PUBLISHED' AND t.genres @> ${JSON.stringify([genre])}::jsonb)` : undefined)).orderBy(desc(dmProfiles.updatedAt)).limit(60);
    const viewer = await requireAuthUser(request);
    const summaries = await discoveryFeedbackList("dm", rows.map(row=>({id:row.userId,ownerId:row.userId})), viewer?.id);
    return { data: rows.map(row=>({...row,publicId:publicAccountId(row.userId),...summaries.get(row.userId)!})) };
  });
  app.get(`${base}/dms/me`, async (request, reply) => {
    const user = await auth(request, reply); if (!user) return;
    const [row] = await db.select().from(dmProfiles).where(eq(dmProfiles.userId, user.id)).limit(1);
    return { data: row ?? null };
  });
  app.put(`${base}/dms/me`, async (request, reply) => {
    const user = await auth(request, reply); if (!user) return;
    const parsed = profileInput.safeParse(request.body); if (!parsed.success) return invalid(reply);
    const [row] = await db.insert(dmProfiles).values({ userId: user.id, ...parsed.data }).onConflictDoUpdate({ target: dmProfiles.userId, set: { ...parsed.data, updatedAt: new Date() } }).returning();
    return { data: row };
  });

  app.get<{ Querystring: { q?: string; genre?: string } }>(`${base}/tables`, async (request, reply) => {
    const parsed = z.object({ q: z.string().trim().max(120).optional(), genre: z.string().max(40).optional() }).safeParse(request.query);
    if (!parsed.success) return invalid(reply);
    const query = parsed.data.q, genre = parsed.data.genre, term = `%${parsed.data.q ?? ""}%`;
    const publicIdMatch = sql`translate(rtrim(encode(substring(sha256(convert_to(${users.id}::text, 'UTF8')) from 1 for 9), 'base64'), '='), '+/', '-_') ILIKE ${term}`;
    const rows = await db.select({ id: gameTables.id, hostUserId: gameTables.hostUserId, hostName: dmProfiles.displayName, title: gameTables.title, description: gameTables.description, genres: gameTables.genres, imageData: gameTables.imageData, hostUsername: users.username, system: gameTables.system, language: gameTables.language, playStyle: gameTables.playStyle, levelRange: gameTables.levelRange, schedule: gameTables.schedule, capacity: gameTables.capacity, visibility: gameTables.visibility, createdAt: gameTables.createdAt }).from(gameTables).innerJoin(users, eq(gameTables.hostUserId, users.id)).leftJoin(dmProfiles, eq(gameTables.hostUserId, dmProfiles.userId)).where(and(eq(gameTables.status, "PUBLISHED"), eq(gameTables.visibility, "PUBLIC"), query ? or(ilike(gameTables.title, term), ilike(gameTables.description, term), ilike(gameTables.system, term), ilike(gameTables.playStyle, term), ilike(dmProfiles.displayName, term), ilike(users.username, term), sql`${users.id}::text ILIKE ${term}`, publicIdMatch, sql`${gameTables.genres}::text ILIKE ${term}`) : undefined, genre ? sql`${gameTables.genres} @> ${JSON.stringify([genre])}::jsonb` : undefined)).orderBy(desc(gameTables.createdAt)).limit(80);
    const viewer = await requireAuthUser(request);
    const summaries = await discoveryFeedbackList("table", rows.map(row=>({id:row.id,ownerId:row.hostUserId})), viewer?.id);
    return { data: rows.map(row=>({...row,hostPublicId:publicAccountId(row.hostUserId),...summaries.get(row.id)!})) };
  });
  app.get<{ Params: { tableId: string } }>(`${base}/tables/:tableId`, async (request, reply) => {
    const key = id.safeParse(request.params.tableId); if (!key.success) return invalid(reply);
    const [table] = await db.select({ id: gameTables.id, hostUserId: gameTables.hostUserId, hostName: dmProfiles.displayName, hostBio: dmProfiles.bio, title: gameTables.title, description: gameTables.description, genres: gameTables.genres, imageData: gameTables.imageData, hostUsername: users.username, system: gameTables.system, language: gameTables.language, playStyle: gameTables.playStyle, levelRange: gameTables.levelRange, schedule: gameTables.schedule, capacity: gameTables.capacity, visibility: gameTables.visibility, createdAt: gameTables.createdAt }).from(gameTables).innerJoin(users, eq(gameTables.hostUserId, users.id)).leftJoin(dmProfiles, eq(gameTables.hostUserId, dmProfiles.userId)).where(and(eq(gameTables.id, key.data), eq(gameTables.status, "PUBLISHED"), eq(gameTables.visibility, "PUBLIC"))).limit(1);
    if (!table) return reply.code(404).send({ error: { message: "این کمپین پیدا نشد." } });
    const user = await requireAuthUser(request);
    const summary = await discoveryFeedback("table", table.id, table.hostUserId, user?.id);
    return { data: { ...table, ...summary, canReview: summary.canReact } };
  });
  app.get(`${base}/tables/me`, async (request, reply) => {
    const user = await auth(request, reply); if (!user) return;
    const [hosted, applications] = await Promise.all([
      db.select().from(gameTables).where(eq(gameTables.hostUserId, user.id)).orderBy(desc(gameTables.createdAt)).limit(80),
      db.select({ id: gameApplications.id, tableId: gameApplications.tableId, title: gameTables.title, status: gameApplications.status, note: gameApplications.note, tableStatus: gameTables.status, tableUpdatedAt: gameTables.updatedAt }).from(gameApplications).innerJoin(gameTables, eq(gameApplications.tableId, gameTables.id)).where(eq(gameApplications.userId, user.id)).orderBy(desc(gameApplications.createdAt)).limit(80),
    ]);
    const queued = await db.select({ tableId: gameTableDeletions.tableId }).from(gameTableDeletions);
    const pending = new Set(queued.map(row => row.tableId));
    const statuses = await fetchVttTableStatuses([...hosted.map(table => table.id), ...applications.map(application => application.tableId)]);
    return { data: { hosted: hosted.map(table => ({ ...publicTable(table), deletionPending: pending.has(table.id), sessionStatus: statuses?.[table.id] ?? null })), applications: applications.map(application => ({ ...application, sessionStatus: statuses?.[application.tableId] ?? null })) } };
  });
  app.post(`${base}/tables`, async (request, reply) => {
    const user = await auth(request, reply); if (!user) return;
    const parsed = tableInput.safeParse(request.body); if (!parsed.success) return invalid(reply);
    const visibility = parsed.data.visibility ?? "PUBLIC";
    const inviteCode = visibility === "PRIVATE" ? newInviteCode() : null;
    const [row] = await db.insert(gameTables).values({ ...parsed.data, visibility, hostUserId: user.id, inviteCodeHash: inviteCode ? inviteHash(inviteCode) : null }).returning();
    if (!row) throw new Error("Table insert failed");
    return reply.code(201).send({ data: { ...publicTable(row), inviteCode } });
  });
  app.put<{ Params: { tableId: string } }>(`${base}/tables/:tableId`, async (request, reply) => {
    const user = await auth(request, reply); if (!user) return;
    const key = id.safeParse(request.params.tableId), parsed = tableInput.safeParse(request.body);
    if (!key.success || !parsed.success) return invalid(reply);
    const [existing] = await db.select().from(gameTables).where(and(eq(gameTables.id, key.data), eq(gameTables.hostUserId, user.id), ne(gameTables.status, "HIDDEN"))).limit(1);
    if (!existing) return reply.code(404).send({ error: { message: "میز پیدا نشد یا دسترسی ندارید." } });
    const [pending] = await db.select().from(gameTableDeletions).where(eq(gameTableDeletions.tableId, key.data)).limit(1);
    if (pending) return reply.code(409).send({ error: { message: "حذف میز در حال انجام است." } });
    const visibility = parsed.data.visibility ?? existing.visibility;
    const inviteCode = visibility === "PRIVATE" && !existing.inviteCodeHash ? newInviteCode() : null;
    // B73: the row lock is the same one seat reservations take, so the seated count can't change underneath.
    const row = await db.transaction(async tx => {
      await tx.execute(sql`select id from game_tables where id = ${key.data} for update`);
      const [seated] = await tx.select({ total: sql<number>`count(*)::int` }).from(gameApplications).where(and(eq(gameApplications.tableId, key.data), eq(gameApplications.status, "ACCEPTED")));
      if (parsed.data.capacity < (seated?.total ?? 0)) return { seated: seated?.total ?? 0 };
      const [updated] = await tx.update(gameTables).set({ ...parsed.data, visibility, ...(inviteCode ? { inviteCodeHash: inviteHash(inviteCode) } : {}), updatedAt: new Date() }).where(and(eq(gameTables.id, key.data), eq(gameTables.hostUserId, user.id), ne(gameTables.status, "HIDDEN"))).returning();
      return updated;
    });
    if (row && "seated" in row) return reply.code(409).send({ error: { code: "CAPACITY_BELOW_SEATED", message: `ظرفیت نمی‌تواند از تعداد بازیکنان پذیرفته‌شده (${row.seated.toLocaleString("fa-IR")}) کمتر باشد.` } });
    if (!row) return reply.code(404).send({ error: { message: "میز پیدا نشد یا دسترسی ندارید." } });
    return { data: { ...publicTable(row), inviteCode } };
  });
  app.post<{ Params: { tableId: string } }>(`${base}/tables/:tableId/invite/rotate`, async (request, reply) => {
    const user = await auth(request, reply); if (!user) return;
    const key = id.safeParse(request.params.tableId); if (!key.success) return invalid(reply);
    const inviteCode = newInviteCode();
    const [row] = await db.update(gameTables).set({ inviteCodeHash: inviteHash(inviteCode), updatedAt: new Date() }).where(and(eq(gameTables.id, key.data), eq(gameTables.hostUserId, user.id), eq(gameTables.visibility, "PRIVATE"), ne(gameTables.status, "HIDDEN"))).returning();
    if (!row) return reply.code(404).send({ error: { message: "میز خصوصی پیدا نشد." } });
    return { data: { inviteCode } };
  });
  app.post(`${base}/tables/join-by-code`, async (request, reply) => {
    const user = await auth(request, reply); if (!user) return;
    const parsed = z.object({ code: z.string().trim().toUpperCase().regex(/^(?:[A-Z2-9]{6}|[A-Z0-9_-]{8,32})$/) }).safeParse(request.body); if (!parsed.success) return invalid(reply);
    if (parsed.data.code.length === 6) {
      const secret = process.env.VTT_BRIDGE_SECRET?.trim() ?? "", baseUrl = process.env.VTT_PUBLIC_URL?.trim();
      if (!baseUrl || secret.length < 32) return reply.code(503).send({ error: { message: "اتصال سرور بازی آماده نیست." } });
      let target: URL;
      try {
        target = new URL("api/platform/launch", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
        if (!["https:", "http:"].includes(target.protocol) || (process.env.NODE_ENV === "production" && target.protocol !== "https:")) throw new Error();
      } catch { return reply.code(503).send({ error: { message: "نشانی سرور بازی معتبر نیست." } }); }
      const username = user.username && /^[a-z][a-z0-9_]{2,23}$/i.test(user.username) ? user.username : `player_${user.id.replaceAll("-", "").slice(0, 10)}`;
      const result = await requestNativeVttInvite({ code: parsed.data.code, userId: user.id, username }, secret);
      const bridgeMissing = result.ticket ? null : inviteBridgeError(result.status);
      if (bridgeMissing) { request.log.warn("Join by code failed: the table-app bridge did not answer and VTT_INTERNAL_URL is not set"); return reply.code(503).send({ error: bridgeMissing }); }
      if (!result.ticket) return reply.code(result.status).send({ error: { message: result.status === 404 ? "کد دعوت معتبر نیست یا میز بایگانی شده است." : result.status === 409 ? "این میز متعلق به حساب DM شماست؛ از میزهای من وارد شوید." : result.status === 429 ? "کمی صبر کنید و دوباره تلاش کنید." : "ارتباط با سرور بازی برقرار نشد." } });
      if (result.tableId) {
        const [table] = await db.select().from(gameTables).where(eq(gameTables.id, result.tableId)).limit(1);
        if (!table || table.hostUserId === user.id || !["PRIVATE", "PUBLIC"].includes(table.visibility)) return reply.code(409).send({ error: { message: "این میز برای ورود بازیکن باز نیست." } });
        const seat = await reservePlayerSeat(table.id, user.id, table.visibility as "PRIVATE" | "PUBLIC");
        if (seat !== "accepted") return reply.code(409).send({ error: { message: seat === "full" ? "ظرفیت میز تکمیل است." : "این میز دیگر باز نیست." } });
      }
      target.searchParams.set("ticket", result.ticket);
      reply.header("Cache-Control", "no-store");
      return { data: { launchUrl: target.toString() } };
    }
    const [table] = await db.select().from(gameTables).where(and(eq(gameTables.inviteCodeHash, inviteHash(parsed.data.code)), eq(gameTables.visibility, "PRIVATE"), eq(gameTables.status, "PUBLISHED"))).limit(1);
    if (!table || table.hostUserId === user.id) return reply.code(404).send({ error: { message: "کد دعوت معتبر نیست." } });
    const result = await reservePlayerSeat(table.id, user.id, "PRIVATE", inviteHash(parsed.data.code));
    if (result !== "accepted") return reply.code(409).send({ error: { message: result === "full" ? "ظرفیت میز تکمیل است." : "این میز دیگر باز نیست." } });
    return { data: publicTable(table) };
  });
  app.post<{ Params: { tableId: string } }>(`${base}/tables/:tableId/launch`, async (request, reply) => {
    const user = await auth(request, reply); if (!user) return;
    const key = id.safeParse(request.params.tableId), parsed = z.object({ role: z.enum(["dm", "player"]) }).safeParse(request.body);
    if (!key.success || !parsed.success) return invalid(reply);
    const [table] = await db.select().from(gameTables).where(eq(gameTables.id, key.data)).limit(1);
    if (!table) return reply.code(404).send({ error: { message: "میز پیدا نشد." } });
    const [application] = parsed.data.role === "player" ? await db.select({ status: gameApplications.status }).from(gameApplications).where(and(eq(gameApplications.tableId, table.id), eq(gameApplications.userId, user.id))).limit(1) : [];
    if (!canLaunchTable(table, user.id, parsed.data.role, application?.status === "ACCEPTED")) return reply.code(403).send({ error: { message: "اجازهٔ ورود به این میز را ندارید." } });
    const vttUsername = user.username && /^[a-z][a-z0-9_]{2,23}$/i.test(user.username)
      ? user.username
      : `player_${user.id.replaceAll("-", "").slice(0, 10)}`;
    const baseUrl = process.env.VTT_PUBLIC_URL?.trim(), secret = process.env.VTT_BRIDGE_SECRET?.trim();
    if (!baseUrl || !secret || secret.length < 32) return reply.code(503).send({ error: { message: "سرور بازی هنوز پیکربندی نشده است." } });
    let target: URL;
    try { target = new URL("api/platform/launch", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`); if (!(["https:", "http:"].includes(target.protocol)) || (process.env.NODE_ENV === "production" && target.protocol !== "https:")) throw new Error(); }
    catch { return reply.code(503).send({ error: { message: "نشانی سرور بازی معتبر نیست." } }); }
    if (parsed.data.role === "player" && application?.status !== "ACCEPTED") {
      const result = await reservePlayerSeat(table.id, user.id, "PUBLIC");
      if (result !== "accepted") return reply.code(409).send({ error: { message: result === "full" ? "ظرفیت میز تکمیل است." : "این میز دیگر باز نیست." } });
    }
    const ticket = createVttTicket({ tableId: table.id, userId: user.id, hostUserId: table.hostUserId, title: table.title, role: parsed.data.role, username: vttUsername }, secret);
    target.searchParams.set("ticket", ticket);
    reply.header("Cache-Control", "no-store");
    return { data: { url: target.toString() } };
  });
  app.post<{ Params: { tableId: string } }>(`${base}/tables/:tableId/apply`, async (request, reply) => {
    const user = await auth(request, reply); if (!user) return;
    const key = id.safeParse(request.params.tableId), parsed = z.object({ note: text(500) }).safeParse(request.body);
    if (!key.success || !parsed.success) return invalid(reply);
    const [table] = await db.select().from(gameTables).where(and(eq(gameTables.id, key.data), eq(gameTables.status, "PUBLISHED"))).limit(1);
    if (!table) return reply.code(404).send({ error: { message: "میز فعال پیدا نشد." } });
    if (table.hostUserId === user.id) return reply.code(409).send({ error: { message: "نمی‌توانید به میز خودتان درخواست دهید." } });
    const [existing] = await db.select().from(gameApplications).where(and(eq(gameApplications.tableId, key.data), eq(gameApplications.userId, user.id))).limit(1);
    if (existing && ["PENDING", "ACCEPTED"].includes(existing.status)) return reply.code(409).send({ error: { message: "درخواست فعالی برای این میز دارید." } });
    const [row] = existing
      ? await db.update(gameApplications).set({ note: parsed.data.note, status: "PENDING", updatedAt: new Date() }).where(eq(gameApplications.id, existing.id)).returning()
      : await db.insert(gameApplications).values({ tableId: key.data, userId: user.id, note: parsed.data.note }).onConflictDoNothing().returning();
    if (!row) return reply.code(409).send({ error: { message: "درخواست فعالی برای این میز دارید." } });
    return { data: row };
  });
  app.post<{ Params: { applicationId: string } }>(`${base}/applications/:applicationId/withdraw`, async (request, reply) => {
    const user = await auth(request, reply); if (!user) return;
    const key = id.safeParse(request.params.applicationId); if (!key.success) return invalid(reply);
    const [row] = await db.update(gameApplications).set({ status: "WITHDRAWN", updatedAt: new Date() }).where(and(eq(gameApplications.id, key.data), eq(gameApplications.userId, user.id), ne(gameApplications.status, "WITHDRAWN"))).returning();
    if (!row) return reply.code(404).send({ error: { message: "درخواست پیدا نشد." } });
    return { data: row };
  });
  app.get<{ Params: { tableId: string } }>(`${base}/tables/:tableId/applications`, async (request, reply) => {
    const user = await auth(request, reply); if (!user) return;
    const key = id.safeParse(request.params.tableId); if (!key.success) return invalid(reply);
    const [table] = await db.select().from(gameTables).where(and(eq(gameTables.id, key.data), eq(gameTables.hostUserId, user.id))).limit(1);
    if (!table) return reply.code(404).send({ error: { message: "میز پیدا نشد." } });
    const rows = await db.select({ id: gameApplications.id, userId: gameApplications.userId, email: users.email, note: gameApplications.note, status: gameApplications.status, createdAt: gameApplications.createdAt }).from(gameApplications).innerJoin(users, eq(gameApplications.userId, users.id)).where(eq(gameApplications.tableId, key.data)).orderBy(desc(gameApplications.createdAt));
    return { data: rows };
  });
  app.post<{ Params: { applicationId: string } }>(`${base}/applications/:applicationId/respond`, async (request, reply) => {
    const user = await auth(request, reply); if (!user) return;
    const key = id.safeParse(request.params.applicationId), parsed = z.object({ accept: z.boolean() }).safeParse(request.body);
    if (!key.success || !parsed.success) return invalid(reply);
    const result = await db.transaction(async tx => {
      const [application] = await tx.select().from(gameApplications).where(eq(gameApplications.id, key.data)).limit(1);
      if (!application) return "missing";
      await tx.execute(sql`select id from game_tables where id = ${application.tableId} for update`);
      const [table] = await tx.select().from(gameTables).where(eq(gameTables.id, application.tableId)).limit(1);
      if (!table || table.hostUserId !== user.id || table.status === "HIDDEN") return "missing";
      if (parsed.data.accept && table.status !== "PUBLISHED") return "closed";
      if (application.status !== "PENDING") return "resolved";
      if (parsed.data.accept) {
        const [count] = await tx.select({ total: sql<number>`count(*)::int` }).from(gameApplications).where(and(eq(gameApplications.tableId, table.id), eq(gameApplications.status, "ACCEPTED")));
        if ((count?.total ?? 0) >= table.capacity) return "full";
      }
      const [row] = await tx.update(gameApplications).set({ status: parsed.data.accept ? "ACCEPTED" : "DECLINED", updatedAt: new Date() }).where(eq(gameApplications.id, application.id)).returning();
      return row;
    });
    if (typeof result === "string") return reply.code(result === "missing" ? 404 : 409).send({ error: { message: result === "full" ? "ظرفیت میز تکمیل است." : result === "closed" ? "برای پذیرش بازیکن، میز باید منتشرشده باشد." : "درخواست قابل بررسی نیست." } });
    return { data: result };
  });

  // B55: players per side by mode; the owner counts as one of them.
  const arenaPlayerLimit = sql<number>`case ${arenaListings.mode} when '3V3' then 6 when '2V2' then 4 else 2 end`.mapWith(Number);
  const arenaPlayerCount = sql<number>`(1 + (select count(*) from arena_participants p where p.listing_id = ${arenaListings.id}))::int`.mapWith(Number);
  const arenaColumns = { id: arenaListings.id, ownerUserId: arenaListings.ownerUserId, opponentUserId: arenaListings.opponentUserId, mode: arenaListings.mode, title: arenaListings.title, note: arenaListings.note, status: arenaListings.status, createdAt: arenaListings.createdAt, updatedAt: arenaListings.updatedAt, playerCount: arenaPlayerCount, playerLimit: arenaPlayerLimit };
  app.get(`${base}/arena`, async () => {
    const rows = await db.select(arenaColumns).from(arenaListings).where(eq(arenaListings.status, "OPEN")).orderBy(desc(arenaListings.createdAt)).limit(80);
    return { data: rows };
  });
  app.get(`${base}/arena/me`, async (request, reply) => {
    const user = await auth(request, reply); if (!user) return;
    const rows = await db.select(arenaColumns).from(arenaListings).where(sql`${arenaListings.ownerUserId} = ${user.id} or exists (select 1 from arena_participants p where p.listing_id = ${arenaListings.id} and p.user_id = ${user.id})`).orderBy(desc(arenaListings.createdAt)).limit(80);
    return { data: rows };
  });
  app.post(`${base}/arena`, async (request, reply) => {
    const user = await auth(request, reply); if (!user) return;
    const parsed = arenaInput.safeParse(request.body); if (!parsed.success) return invalid(reply);
    const [row] = await db.insert(arenaListings).values({ ...parsed.data, ownerUserId: user.id }).returning();
    return reply.code(201).send({ data: row });
  });
  app.post<{ Params: { listingId: string } }>(`${base}/arena/:listingId/join`, async (request, reply) => {
    const user = await auth(request, reply); if (!user) return;
    const key = id.safeParse(request.params.listingId); if (!key.success) return invalid(reply);
    const row = await db.transaction(async tx => {
      const [listing] = await tx.select().from(arenaListings).where(eq(arenaListings.id, key.data)).for("update").limit(1);
      if (!listing || listing.status !== "OPEN" || listing.ownerUserId === user.id) return null;
      const [joined] = await tx.insert(arenaParticipants).values({ listingId: listing.id, userId: user.id }).onConflictDoNothing().returning();
      if (!joined) return null;
      const [count] = await tx.select({ total: sql<number>`count(*)::int` }).from(arenaParticipants).where(eq(arenaParticipants.listingId, listing.id));
      const playerCount = 1 + (count?.total ?? 0), playerLimit = listing.mode === "3V3" ? 6 : listing.mode === "2V2" ? 4 : 2;
      const [updated] = await tx.update(arenaListings).set({ opponentUserId: listing.opponentUserId ?? user.id, status: playerCount >= playerLimit ? "MATCHED" : "OPEN", updatedAt: new Date() }).where(eq(arenaListings.id, listing.id)).returning();
      return updated ? { ...updated, playerCount, playerLimit } : null;
    });
    if (!row) return reply.code(409).send({ error: { message: "این دعوت دیگر در دسترس نیست." } });
    return { data: row };
  });
  app.post<{ Params: { listingId: string } }>(`${base}/arena/:listingId/cancel`, async (request, reply) => {
    const user = await auth(request, reply); if (!user) return;
    const key = id.safeParse(request.params.listingId); if (!key.success) return invalid(reply);
    const [row] = await db.update(arenaListings).set({ status: "CANCELLED", updatedAt: new Date() }).where(and(eq(arenaListings.id, key.data), eq(arenaListings.ownerUserId, user.id), ne(arenaListings.status, "HIDDEN"))).returning();
    if (!row) return reply.code(404).send({ error: { message: "دعوت پیدا نشد." } });
    return { data: row };
  });

  app.get(`${base}/admin/overview`, async (request, reply) => {
    const admin = await getAdmin(request); if (!admin) return reply.code(403).send({ error: { message: "دسترسی مدیر لازم است." } });
    const [profiles, tables, applications, arena, profileCount, tableCount, pendingCount, arenaCount] = await Promise.all([
      db.select().from(dmProfiles).orderBy(desc(dmProfiles.updatedAt)).limit(30),
      db.select().from(gameTables).orderBy(desc(gameTables.createdAt)).limit(40),
      db.select().from(gameApplications).orderBy(desc(gameApplications.createdAt)).limit(30),
      db.select().from(arenaListings).orderBy(desc(arenaListings.createdAt)).limit(30),
      db.select({ total: sql<number>`count(*)::int` }).from(dmProfiles),
      db.select({ total: sql<number>`count(*)::int` }).from(gameTables),
      db.select({ total: sql<number>`count(*)::int` }).from(gameApplications).where(eq(gameApplications.status, "PENDING")),
      db.select({ total: sql<number>`count(*)::int` }).from(arenaListings).where(eq(arenaListings.status, "OPEN")),
    ]);
    return { data: { profiles, tables, applications, arena, counts: { profiles: profileCount[0]?.total ?? 0, tables: tableCount[0]?.total ?? 0, pending: pendingCount[0]?.total ?? 0, arena: arenaCount[0]?.total ?? 0 } } };
  });
  app.post<{ Params: { kind: string; targetId: string } }>(`${base}/admin/:kind/:targetId/moderate`, async (request, reply) => {
    const parsed = moderationInput.safeParse(request.body), key = id.safeParse(request.params.targetId);
    if (!parsed.success || !key.success || !["dms", "tables", "arena"].includes(request.params.kind)) return invalid(reply);
    const admin = await reauth(request, parsed.data.password);
    if (!admin || admin.role === "SUPPORT") return reply.code(403).send({ error: { message: "رمز مدیر یا دسترسی معتبر نیست." } });
    const { kind } = request.params;
    if (kind === "dms") {
      const [row] = await db.update(dmProfiles).set({ visible: parsed.data.action === "RESTORE", updatedAt: new Date() }).where(eq(dmProfiles.userId, key.data)).returning();
      if (!row) return reply.code(404).send({ error: { message: "پروفایل پیدا نشد." } });
      await db.insert(marketplaceAdminAuditLogs).values({ adminUserId: admin.userId, action: parsed.data.action, entityType: "dm_profile", entityId: key.data, details: JSON.stringify({ reason: parsed.data.reason }) });
      return { data: row };
    }
    if (kind === "tables") {
      const result = await db.transaction(async tx => {
        await tx.execute(sql`SELECT id FROM game_tables WHERE id=${key.data} FOR UPDATE`);
        const [pending] = await tx.select().from(gameTableDeletions).where(eq(gameTableDeletions.tableId, key.data)).limit(1);
        if (pending) return { pending: true as const };
        const [row] = await tx.update(gameTables).set({ status: parsed.data.action === "HIDE" ? "HIDDEN" : "DRAFT", updatedAt: new Date() }).where(eq(gameTables.id, key.data)).returning();
        return { row };
      });
      if ("pending" in result) return reply.code(409).send({ error: { message: "حذف میز در حال انجام است." } });
      const row = result.row;
      if (!row) return reply.code(404).send({ error: { message: "میز پیدا نشد." } });
      await db.insert(marketplaceAdminAuditLogs).values({ adminUserId: admin.userId, action: parsed.data.action, entityType: "game_table", entityId: key.data, details: JSON.stringify({ reason: parsed.data.reason }) });
      return { data: row };
    }
    const [row] = await db.update(arenaListings).set({ status: parsed.data.action === "HIDE" ? "HIDDEN" : "CANCELLED", updatedAt: new Date() }).where(eq(arenaListings.id, key.data)).returning();
    if (!row) return reply.code(404).send({ error: { message: "دعوت پیدا نشد." } });
    await db.insert(marketplaceAdminAuditLogs).values({ adminUserId: admin.userId, action: parsed.data.action, entityType: "arena_listing", entityId: key.data, details: JSON.stringify({ reason: parsed.data.reason }) });
    return { data: row };
  });
}
