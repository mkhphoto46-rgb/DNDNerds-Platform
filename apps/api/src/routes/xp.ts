import type { FastifyInstance } from "fastify";
import { requireAuthUser } from "../auth/session.js";
import { sqlClient } from "../db/client.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { accruePresence, INITIAL_XP, xpSnapshot } from "./xp-policy.js";

type XpRow = { total_xp: string; active_seconds: number; last_heartbeat_at: Date | null };

function response(row: XpRow, leveledUp = false) {
  const totalXp = Number(row.total_xp);
  return { ...xpSnapshot(totalXp), leveledUp };
}

export async function registerXpRoutes(app: FastifyInstance) {
  app.get("/api/v1/xp", async (request, reply) => {
    const user = await requireAuthUser(request);
    if (!user) return reply.code(401).send({ error: { message: "برای دیدن XP وارد حساب شو." } });
    await sqlClient`INSERT INTO user_xp (user_id, total_xp) VALUES (${user.id}, ${INITIAL_XP}) ON CONFLICT (user_id) DO NOTHING`;
    // Opening the site starts a new active window so its first full minute counts.
    await sqlClient`
      UPDATE user_xp SET last_heartbeat_at = now(), active_seconds = 0
      WHERE user_id = ${user.id} AND (last_heartbeat_at IS NULL OR last_heartbeat_at < now() - interval '120 seconds')`;
    const rows = await sqlClient<XpRow[]>`SELECT total_xp, active_seconds, last_heartbeat_at FROM user_xp WHERE user_id = ${user.id}`;
    return response(rows[0]!);
  });

  app.post("/api/v1/xp/heartbeat", async (request, reply) => {
    const user = await requireAuthUser(request);
    if (!user) return reply.code(401).send({ error: { message: "برای دریافت XP وارد حساب شو." } });
    const mode = (request.body as { mode?: unknown } | null)?.mode === "game" ? "game" : "site";
    if (mode === "game") {
      const secret = process.env.VTT_BRIDGE_SECRET ?? "";
      const supplied = String(request.headers["x-xp-game-proof"] ?? "");
      const expected = createHmac("sha256", secret).update(`game-xp:${user.id}`).digest("hex");
      if (secret.length < 32 || !/^[a-f0-9]{64}$/.test(supplied) ||
          !timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(expected, "hex"))) {
        return reply.code(403).send({ error: { message: "حضور در بازی تأیید نشد." } });
      }
    }
    return sqlClient.begin(async (tx) => {
      await tx`INSERT INTO user_xp (user_id, total_xp) VALUES (${user.id}, ${INITIAL_XP}) ON CONFLICT (user_id) DO NOTHING`;
      const rows = await tx<XpRow[]>`SELECT total_xp, active_seconds, last_heartbeat_at FROM user_xp WHERE user_id = ${user.id} FOR UPDATE`;
      const row = rows[0]!;
      const now = new Date();
      const nowIso = now.toISOString();
      // A visible client may report once per minute. Long gaps and extra tabs cannot mint extra time.
      const elapsed = row.last_heartbeat_at ? (now.getTime() - new Date(row.last_heartbeat_at).getTime()) / 1000 : 0;
      const { earned, activeSeconds } = accruePresence(row.active_seconds, elapsed, mode);
      const updated = await tx<XpRow[]>`
        UPDATE user_xp SET total_xp = total_xp + ${earned}, active_seconds = ${activeSeconds},
        last_heartbeat_at = ${nowIso}::timestamptz, updated_at = ${nowIso}::timestamptz WHERE user_id = ${user.id}
        RETURNING total_xp, active_seconds, last_heartbeat_at`;
      return response(updated[0]!, xpSnapshot(Number(updated[0]!.total_xp)).level > xpSnapshot(Number(row.total_xp)).level);
    });
  });
}
