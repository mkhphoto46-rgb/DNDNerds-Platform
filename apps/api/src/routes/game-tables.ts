import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAuthUser } from "../auth/session.js";
import { db } from "../db/client.js";
import { gameTableInvites, gameTableMembers, gameTables, playerProfiles, socialBlocks,
  socialFriendships, socialProfiles, vttInstances } from "../db/schema.js";

// Roadmap phase 10: game tables. A DM creates a table for one edition, invites
// friends or shares a join code, and launches the table into their VTT (see
// table-launch.ts). Seats: 1 DM, up to 9 players, at most 1 observer. Members
// see each other by display name only, never by email.
const uuid = z.string().uuid();
// Control characters other than tab and line breaks are refused in names.
const badChars = { test: (value: string) => [...value].some((char) => { const code = char.charCodeAt(0); return code < 32 && code !== 9 && code !== 10 && code !== 13; }) };
const displayNameBody = z.object({ displayName: z.string().trim().min(2).max(32) });
const editionValue = z.enum(["2014", "2024", "mixed"]);
const createBody = z.object({
  name: z.string().trim().min(2).max(80),
  edition: editionValue.default("2024"),
  maxPlayers: z.number().int().min(1).max(9).default(6),
  allowObserver: z.boolean().default(true),
});
const updateBody = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  edition: editionValue.optional(),
  maxPlayers: z.number().int().min(1).max(9).optional(),
  allowObserver: z.boolean().optional(),
  vttInstanceId: uuid.nullable().optional(),
  /** Changing the edition after the first launch needs the DM's confirmation. */
  confirmEditionChange: z.boolean().optional(),
});
const inviteBody = z.object({
  friendCode: z.string().trim().toUpperCase().regex(/^DND-[A-F0-9]{24}$/),
  role: z.enum(["player", "observer"]).default("player"),
});
const joinBody = z.object({ joinCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{8}$/) });
const roleBody = z.object({ role: z.enum(["player", "observer"]) });
const instanceBody = z.object({
  name: z.string().trim().min(2).max(80),
  // An https address, or http on this computer for local play.
  baseUrl: z.string().trim().max(300).url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  }, "An https address (or http on localhost) is required."),
});

type Role = "dm" | "player" | "observer";

function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message } });
}
async function actor(request: FastifyRequest, reply: FastifyReply) {
  const user = await requireAuthUser(request);
  if (!user) { fail(reply, 401, "AUTH_REQUIRED", "Login is required."); return null; }
  return user;
}
async function displayNameOf(userId: string) {
  const [row] = await db.select({ name: playerProfiles.displayName }).from(playerProfiles).where(eq(playerProfiles.userId, userId)).limit(1);
  return row?.name ?? null;
}
async function membership(tableId: string, userId: string) {
  const [row] = await db.select({ role: gameTableMembers.role }).from(gameTableMembers)
    .where(and(eq(gameTableMembers.tableId, tableId), eq(gameTableMembers.userId, userId))).limit(1);
  return (row?.role as Role | undefined) ?? null;
}
async function blocked(a: string, b: string) {
  const [row] = await db.select({ blocker: socialBlocks.blockerUserId }).from(socialBlocks)
    .where(or(and(eq(socialBlocks.blockerUserId, a), eq(socialBlocks.blockedUserId, b)),
      and(eq(socialBlocks.blockerUserId, b), eq(socialBlocks.blockedUserId, a)))).limit(1);
  return Boolean(row);
}
async function friends(a: string, b: string) {
  const [low, high] = a < b ? [a, b] : [b, a];
  const [row] = await db.select({ low: socialFriendships.lowerUserId }).from(socialFriendships)
    .where(and(eq(socialFriendships.lowerUserId, low), eq(socialFriendships.upperUserId, high))).limit(1);
  return Boolean(row);
}
const newJoinCode = () => randomBytes(5).toString("hex").toUpperCase().slice(0, 8);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Whether a seat of this role is free, with the table row locked by the caller. */
async function seatFree(tx: Tx, tableId: string, role: Role, exceptUserId?: string) {
  const [table] = await tx.select({ maxPlayers: gameTables.maxPlayers, allowObserver: gameTables.allowObserver })
    .from(gameTables).where(eq(gameTables.id, tableId)).limit(1);
  if (!table) return false;
  if (role === "observer" && !table.allowObserver) return false;
  const rows = await tx.select({ userId: gameTableMembers.userId }).from(gameTableMembers)
    .where(and(eq(gameTableMembers.tableId, tableId), eq(gameTableMembers.role, role)));
  const taken = rows.filter((row) => row.userId !== exceptUserId).length;
  return role === "observer" ? taken < 1 : taken < table.maxPlayers;
}
async function lockTable(tx: Tx, tableId: string) {
  await tx.execute(sql`SELECT id FROM game_tables WHERE id=${tableId}::uuid FOR UPDATE`);
}
/** A member blocked by, or blocking, anyone at the table can't join it. */
async function blockedAtTable(tableId: string, userId: string) {
  const members = await db.select({ userId: gameTableMembers.userId }).from(gameTableMembers).where(eq(gameTableMembers.tableId, tableId));
  for (const member of members) if (member.userId !== userId && await blocked(member.userId, userId)) return true;
  return false;
}

export async function tableDetails(tableId: string) {
  const [table] = await db.select().from(gameTables).where(eq(gameTables.id, tableId)).limit(1);
  if (!table) return null;
  const members = await db.select({ userId: gameTableMembers.userId, role: gameTableMembers.role, displayName: playerProfiles.displayName, joinedAt: gameTableMembers.joinedAt })
    .from(gameTableMembers).leftJoin(playerProfiles, eq(playerProfiles.userId, gameTableMembers.userId))
    .where(eq(gameTableMembers.tableId, tableId)).orderBy(gameTableMembers.joinedAt);
  const [instance] = table.vttInstanceId
    ? await db.select({ id: vttInstances.id, name: vttInstances.name, baseUrl: vttInstances.baseUrl }).from(vttInstances).where(eq(vttInstances.id, table.vttInstanceId)).limit(1)
    : [];
  return {
    id: table.id, name: table.name, edition: table.edition, dmUserId: table.dmUserId, maxPlayers: table.maxPlayers,
    allowObserver: table.allowObserver, firstLaunchedAt: table.firstLaunchedAt, createdAt: table.createdAt,
    vttInstance: instance ?? null, linkedCampaign: Boolean(table.vttCampaignId),
    members: members.map((member) => ({ userId: member.userId, role: member.role, displayName: member.displayName ?? "Player", joinedAt: member.joinedAt })),
    joinCode: table.joinCode,
  };
}

export async function registerGameTableRoutes(app: FastifyInstance) {
  // D-7: the name other players and the VTT see (2-32 characters).
  app.get("/api/v1/profile/display-name", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    return { data: { displayName: await displayNameOf(user.id) } };
  });
  app.put("/api/v1/profile/display-name", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const parsed = displayNameBody.safeParse(request.body);
    if (!parsed.success || badChars.test(parsed.data.displayName)) return fail(reply, 400, "INVALID_DISPLAY_NAME", "Display name must be 2–32 characters.");
    await db.insert(playerProfiles).values({ userId: user.id, displayName: parsed.data.displayName })
      .onConflictDoUpdate({ target: playerProfiles.userId, set: { displayName: parsed.data.displayName, updatedAt: new Date() } });
    return { data: { displayName: parsed.data.displayName } };
  });

  // A DM's registered VTT addresses.
  app.get("/api/v1/vtt-instances", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const rows = await db.select({ id: vttInstances.id, name: vttInstances.name, baseUrl: vttInstances.baseUrl, createdAt: vttInstances.createdAt })
      .from(vttInstances).where(eq(vttInstances.ownerUserId, user.id)).orderBy(desc(vttInstances.createdAt)).limit(20);
    return { data: rows };
  });
  app.post("/api/v1/vtt-instances", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const parsed = instanceBody.safeParse(request.body);
    if (!parsed.success) return fail(reply, 400, "INVALID_INSTANCE", parsed.error.issues[0]?.message ?? "Invalid VTT address.");
    const existing = await db.select({ id: vttInstances.id }).from(vttInstances).where(eq(vttInstances.ownerUserId, user.id)).limit(20);
    if (existing.length >= 20) return fail(reply, 429, "INSTANCE_LIMIT", "Too many VTT addresses.");
    const baseUrl = new URL(parsed.data.baseUrl).origin;
    const [row] = await db.insert(vttInstances).values({ ownerUserId: user.id, name: parsed.data.name, baseUrl })
      .returning({ id: vttInstances.id, name: vttInstances.name, baseUrl: vttInstances.baseUrl, createdAt: vttInstances.createdAt });
    return reply.code(201).send({ data: row });
  });

  app.get("/api/v1/tables", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const rows = await db.select({ id: gameTables.id, name: gameTables.name, edition: gameTables.edition, role: gameTableMembers.role, createdAt: gameTables.createdAt })
      .from(gameTableMembers).innerJoin(gameTables, eq(gameTableMembers.tableId, gameTables.id))
      .where(eq(gameTableMembers.userId, user.id)).orderBy(desc(gameTables.createdAt)).limit(100);
    return { data: rows };
  });
  app.post("/api/v1/tables", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    if (!(await displayNameOf(user.id))) return fail(reply, 409, "DISPLAY_NAME_REQUIRED", "Choose a display name first.");
    const parsed = createBody.safeParse(request.body ?? {});
    if (!parsed.success || badChars.test(parsed.data.name)) return fail(reply, 400, "INVALID_TABLE", "Table name must be 2–80 characters.");
    const owned = await db.select({ id: gameTables.id }).from(gameTables).where(eq(gameTables.dmUserId, user.id)).limit(25);
    if (owned.length >= 25) return fail(reply, 429, "TABLE_LIMIT", "Too many tables.");
    const created = await db.transaction(async (tx) => {
      const [table] = await tx.insert(gameTables).values({ ...parsed.data, dmUserId: user.id, joinCode: newJoinCode() }).returning({ id: gameTables.id });
      if (!table) throw new Error("TABLE_CREATE_EMPTY_RESULT");
      await tx.insert(gameTableMembers).values({ tableId: table.id, userId: user.id, role: "dm" });
      return table;
    });
    return reply.code(201).send({ data: await tableDetails(created.id) });
  });
  app.get<{ Params: { tableId: string } }>("/api/v1/tables/:tableId", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const id = request.params.tableId;
    if (!uuid.safeParse(id).success) return fail(reply, 400, "INVALID_ID", "Invalid table ID.");
    const role = await membership(id, user.id);
    if (!role) return fail(reply, 404, "NOT_FOUND", "Table not found.");
    const details = await tableDetails(id);
    // The join code is the DM's to share.
    return { data: details && role !== "dm" ? { ...details, joinCode: null, role } : { ...details, role } };
  });
  app.patch<{ Params: { tableId: string } }>("/api/v1/tables/:tableId", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const id = request.params.tableId;
    if (!uuid.safeParse(id).success) return fail(reply, 400, "INVALID_ID", "Invalid table ID.");
    if ((await membership(id, user.id)) !== "dm") return fail(reply, 403, "DM_ONLY", "Only the table's DM can change it.");
    const parsed = updateBody.safeParse(request.body ?? {});
    if (!parsed.success || badChars.test(parsed.data.name ?? "")) return fail(reply, 400, "INVALID_TABLE", "Invalid table settings.");
    const [table] = await db.select().from(gameTables).where(eq(gameTables.id, id)).limit(1);
    if (!table) return fail(reply, 404, "NOT_FOUND", "Table not found.");
    const { confirmEditionChange, ...changes } = parsed.data;
    if (changes.edition && changes.edition !== table.edition && table.firstLaunchedAt && !confirmEditionChange) {
      return fail(reply, 409, "EDITION_CONFIRM_REQUIRED", "The table has been played; confirm the edition change.");
    }
    if (changes.vttInstanceId) {
      const [instance] = await db.select({ id: vttInstances.id }).from(vttInstances)
        .where(and(eq(vttInstances.id, changes.vttInstanceId), eq(vttInstances.ownerUserId, user.id))).limit(1);
      if (!instance) return fail(reply, 400, "INVALID_INSTANCE", "Use one of your own VTT addresses.");
    }
    const players = await db.select({ userId: gameTableMembers.userId }).from(gameTableMembers)
      .where(and(eq(gameTableMembers.tableId, id), eq(gameTableMembers.role, "player")));
    if (changes.maxPlayers !== undefined && changes.maxPlayers < players.length) return fail(reply, 409, "SEATS_TAKEN", "More players are seated than that.");
    await db.update(gameTables).set({
      ...changes,
      // A different VTT means a different campaign there.
      ...(changes.vttInstanceId !== undefined && changes.vttInstanceId !== table.vttInstanceId ? { vttCampaignId: null } : {}),
    }).where(eq(gameTables.id, id));
    return { data: await tableDetails(id) };
  });

  app.get("/api/v1/tables/invites/mine", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const rows = await db.select({ id: gameTableInvites.id, tableId: gameTableInvites.tableId, name: gameTables.name, edition: gameTables.edition, role: gameTableInvites.role, createdAt: gameTableInvites.createdAt })
      .from(gameTableInvites).innerJoin(gameTables, eq(gameTableInvites.tableId, gameTables.id))
      .where(and(eq(gameTableInvites.invitedUserId, user.id), eq(gameTableInvites.status, "PENDING")))
      .orderBy(desc(gameTableInvites.createdAt)).limit(100);
    return { data: rows };
  });
  app.post<{ Params: { tableId: string } }>("/api/v1/tables/:tableId/invites", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const id = request.params.tableId;
    if (!uuid.safeParse(id).success) return fail(reply, 400, "INVALID_ID", "Invalid table ID.");
    if ((await membership(id, user.id)) !== "dm") return fail(reply, 403, "DM_ONLY", "Only the table's DM can invite.");
    const parsed = inviteBody.safeParse(request.body);
    if (!parsed.success) return fail(reply, 400, "INVALID_CODE", "Invalid Friend ID.");
    const [target] = await db.select({ userId: socialProfiles.userId }).from(socialProfiles).where(eq(socialProfiles.friendCode, parsed.data.friendCode)).limit(1);
    if (!target || target.userId === user.id) return fail(reply, 400, "INVALID_TARGET", "Invalid friend.");
    if (!(await friends(user.id, target.userId)) || await blockedAtTable(id, target.userId)) return fail(reply, 403, "NOT_FRIENDS", "Only accepted, unblocked friends can be invited.");
    if (await membership(id, target.userId)) return fail(reply, 409, "ALREADY_MEMBER", "Already at the table.");
    const result = await db.transaction(async (tx) => {
      await lockTable(tx, id);
      if (!(await seatFree(tx, id, parsed.data.role))) return "FULL";
      const [prior] = await tx.select({ id: gameTableInvites.id, status: gameTableInvites.status }).from(gameTableInvites)
        .where(and(eq(gameTableInvites.tableId, id), eq(gameTableInvites.invitedUserId, target.userId))).limit(1);
      if (prior?.status === "PENDING") return "EXISTS";
      if (prior) {
        await tx.update(gameTableInvites).set({ status: "PENDING", role: parsed.data.role, createdAt: new Date(), respondedAt: null, senderUserId: user.id }).where(eq(gameTableInvites.id, prior.id));
      } else {
        await tx.insert(gameTableInvites).values({ tableId: id, senderUserId: user.id, invitedUserId: target.userId, role: parsed.data.role });
      }
      return "OK";
    });
    if (result === "FULL") return fail(reply, 409, "TABLE_FULL", "No free seat for that role.");
    if (result === "EXISTS") return fail(reply, 409, "INVITE_EXISTS", "Invite already pending.");
    return reply.code(201).send({ data: { invited: true } });
  });
  app.post<{ Params: { inviteId: string; answer: string } }>("/api/v1/tables/invites/:inviteId/:answer", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const { inviteId, answer } = request.params;
    if (!uuid.safeParse(inviteId).success || !["accept", "decline"].includes(answer)) return fail(reply, 400, "INVALID_ID", "Invalid invitation.");
    const [invite] = await db.select().from(gameTableInvites)
      .where(and(eq(gameTableInvites.id, inviteId), eq(gameTableInvites.invitedUserId, user.id), eq(gameTableInvites.status, "PENDING"))).limit(1);
    if (!invite) return fail(reply, 404, "NOT_FOUND", "Invitation not found.");
    if (answer === "decline") {
      await db.update(gameTableInvites).set({ status: "DECLINED", respondedAt: new Date() }).where(eq(gameTableInvites.id, inviteId));
      return { data: { declined: true } };
    }
    if (!(await displayNameOf(user.id))) return fail(reply, 409, "DISPLAY_NAME_REQUIRED", "Choose a display name first.");
    if (await blockedAtTable(invite.tableId, user.id)) return fail(reply, 403, "BLOCKED", "You can't join this table.");
    const result = await db.transaction(async (tx) => {
      await lockTable(tx, invite.tableId);
      if (!(await seatFree(tx, invite.tableId, invite.role as Role))) return "FULL";
      await tx.insert(gameTableMembers).values({ tableId: invite.tableId, userId: user.id, role: invite.role }).onConflictDoNothing();
      await tx.update(gameTableInvites).set({ status: "ACCEPTED", respondedAt: new Date() }).where(eq(gameTableInvites.id, inviteId));
      return "OK";
    });
    if (result === "FULL") return fail(reply, 409, "TABLE_FULL", "No free seat for that role.");
    return { data: { tableId: invite.tableId } };
  });
  // Joining with the code the DM shares, as a player.
  app.post("/api/v1/tables/join", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const parsed = joinBody.safeParse(request.body);
    if (!parsed.success) return fail(reply, 400, "INVALID_CODE", "Invalid join code.");
    if (!(await displayNameOf(user.id))) return fail(reply, 409, "DISPLAY_NAME_REQUIRED", "Choose a display name first.");
    const [table] = await db.select({ id: gameTables.id }).from(gameTables).where(eq(gameTables.joinCode, parsed.data.joinCode)).limit(1);
    if (!table) return fail(reply, 404, "NOT_FOUND", "No table has that code.");
    if (await membership(table.id, user.id)) return { data: { tableId: table.id } };
    if (await blockedAtTable(table.id, user.id)) return fail(reply, 403, "BLOCKED", "You can't join this table.");
    const result = await db.transaction(async (tx) => {
      await lockTable(tx, table.id);
      if (!(await seatFree(tx, table.id, "player"))) return "FULL";
      await tx.insert(gameTableMembers).values({ tableId: table.id, userId: user.id, role: "player" }).onConflictDoNothing();
      return "OK";
    });
    if (result === "FULL") return fail(reply, 409, "TABLE_FULL", "The table is full.");
    return reply.code(201).send({ data: { tableId: table.id } });
  });
  app.post<{ Params: { tableId: string } }>("/api/v1/tables/:tableId/leave", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const id = request.params.tableId;
    if (!uuid.safeParse(id).success) return fail(reply, 400, "INVALID_ID", "Invalid table ID.");
    const role = await membership(id, user.id);
    if (!role) return fail(reply, 404, "NOT_FOUND", "Table not found.");
    if (role === "dm") return fail(reply, 409, "DM_CANNOT_LEAVE", "The DM can't leave their own table.");
    await db.delete(gameTableMembers).where(and(eq(gameTableMembers.tableId, id), eq(gameTableMembers.userId, user.id)));
    return { data: { left: true } };
  });
  app.delete<{ Params: { tableId: string; userId: string } }>("/api/v1/tables/:tableId/members/:userId", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const { tableId, userId } = request.params;
    if (!uuid.safeParse(tableId).success || !uuid.safeParse(userId).success) return fail(reply, 400, "INVALID_ID", "Invalid ID.");
    if ((await membership(tableId, user.id)) !== "dm") return fail(reply, 403, "DM_ONLY", "Only the table's DM can remove members.");
    if (userId === user.id) return fail(reply, 409, "DM_CANNOT_LEAVE", "The DM can't remove themselves.");
    await db.delete(gameTableMembers).where(and(eq(gameTableMembers.tableId, tableId), eq(gameTableMembers.userId, userId)));
    return { data: { removed: true } };
  });
  app.patch<{ Params: { tableId: string; userId: string } }>("/api/v1/tables/:tableId/members/:userId", async (request, reply) => {
    const user = await actor(request, reply); if (!user) return;
    const { tableId, userId } = request.params;
    if (!uuid.safeParse(tableId).success || !uuid.safeParse(userId).success) return fail(reply, 400, "INVALID_ID", "Invalid ID.");
    if ((await membership(tableId, user.id)) !== "dm") return fail(reply, 403, "DM_ONLY", "Only the table's DM can change roles.");
    const parsed = roleBody.safeParse(request.body);
    if (!parsed.success) return fail(reply, 400, "INVALID_ROLE", "Role must be player or observer.");
    const current = await membership(tableId, userId);
    if (!current || current === "dm") return fail(reply, 404, "NOT_FOUND", "Member not found.");
    const result = await db.transaction(async (tx) => {
      await lockTable(tx, tableId);
      if (current !== parsed.data.role && !(await seatFree(tx, tableId, parsed.data.role, userId))) return "FULL";
      await tx.update(gameTableMembers).set({ role: parsed.data.role }).where(and(eq(gameTableMembers.tableId, tableId), eq(gameTableMembers.userId, userId)));
      return "OK";
    });
    if (result === "FULL") return fail(reply, 409, "TABLE_FULL", "No free seat for that role.");
    return { data: await tableDetails(tableId) };
  });
}

