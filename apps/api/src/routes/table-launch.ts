import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthUser } from "../auth/session.js";
import { db } from "../db/client.js";
import { gameTableMembers, gameTables, playerProfiles, vttInstances, vttLaunchTickets } from "../db/schema.js";
import { launchKey, signLaunchTicket, type LaunchClaims } from "../integrations/launch-tickets.js";
import { consumeRateLimit } from "../security/redis-rate-limit.js";

// Roadmap phase 10: "Enter the table". A member gets a signed ticket for the
// table's own VTT; the browser opens <VTT>/platform/launch#t=<ticket>. The VTT
// address comes only from the table's record, so this can't redirect anywhere else.
const uuid = z.string().uuid();

export async function registerTableLaunchRoutes(app: FastifyInstance) {
  // The public key a VTT host trusts (set in the VTT's host settings).
  app.get("/api/v1/platform/launch-keys", async (_request, reply) => {
    const key = launchKey();
    if (!key) return reply.code(503).send({ error: { code: "LAUNCH_NOT_CONFIGURED", message: "Launching into a VTT isn't set up on this Platform." } });
    return { data: { issuer: "dndnerds-platform", keys: [{ kid: key.kid, alg: "EdDSA", publicKeyPem: key.publicPem }] } };
  });

  app.post<{ Params: { tableId: string } }>("/api/v1/tables/:tableId/launch", async (request, reply) => {
    const user = await requireAuthUser(request);
    if (!user) return reply.code(401).send({ error: { code: "AUTH_REQUIRED", message: "Login is required." } });
    const id = request.params.tableId;
    if (!uuid.safeParse(id).success) return reply.code(400).send({ error: { code: "INVALID_ID", message: "Invalid table ID." } });
    const limit = await consumeRateLimit(`launch:${user.id}`, 10, 60_000);
    if (limit.limited) return reply.code(429).header("Retry-After", String(limit.retryAfterSeconds)).send({ error: { code: "RATE_LIMITED", message: "Too many launches; wait a moment." } });

    const [member] = await db.select({ role: gameTableMembers.role }).from(gameTableMembers)
      .where(and(eq(gameTableMembers.tableId, id), eq(gameTableMembers.userId, user.id))).limit(1);
    if (!member) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Table not found." } });
    const [table] = await db.select().from(gameTables).where(eq(gameTables.id, id)).limit(1);
    if (!table?.vttInstanceId) return reply.code(409).send({ error: { code: "NO_VTT", message: "The DM hasn't chosen a VTT for this table." } });
    if (member.role !== "dm" && !table.firstLaunchedAt) return reply.code(409).send({ error: { code: "NOT_OPENED", message: "The DM has to open the table in the VTT first." } });
    const [instance] = await db.select({ id: vttInstances.id, baseUrl: vttInstances.baseUrl }).from(vttInstances).where(eq(vttInstances.id, table.vttInstanceId)).limit(1);
    if (!instance) return reply.code(409).send({ error: { code: "NO_VTT", message: "The DM hasn't chosen a VTT for this table." } });
    const [profile] = await db.select({ name: playerProfiles.displayName }).from(playerProfiles).where(eq(playerProfiles.userId, user.id)).limit(1);
    if (!profile) return reply.code(409).send({ error: { code: "DISPLAY_NAME_REQUIRED", message: "Choose a display name first." } });
    if (!launchKey()) return reply.code(503).send({ error: { code: "LAUNCH_NOT_CONFIGURED", message: "Launching into a VTT isn't set up on this Platform." } });

    const { token, claims } = signLaunchTicket({
      aud: instance.id, sub: user.id, name: profile.name, role: member.role as LaunchClaims["role"],
      tbl: table.id, tname: table.name, ed: table.edition as LaunchClaims["ed"],
    });
    await db.insert(vttLaunchTickets).values({
      jti: claims.jti, tableId: table.id, userId: user.id, vttInstanceId: instance.id, role: claims.role,
      issuedAt: new Date(claims.iat * 1000), expiresAt: new Date(claims.exp * 1000),
    });
    if (member.role === "dm" && !table.firstLaunchedAt) await db.update(gameTables).set({ firstLaunchedAt: new Date() }).where(eq(gameTables.id, table.id));
    request.log.info({ tableId: table.id, role: claims.role, jti: claims.jti }, "VTT launch ticket issued");
    // The ticket rides after "#", which browsers never send to a server.
    return { data: { url: `${instance.baseUrl}/platform/launch#t=${token}`, expiresAt: new Date(claims.exp * 1000).toISOString() } };
  });
}
