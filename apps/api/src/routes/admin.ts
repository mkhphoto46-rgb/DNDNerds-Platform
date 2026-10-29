import type {
  FastifyInstance,
  FastifyRequest,
} from "fastify";
import { statfsSync } from "node:fs";
import { freemem, loadavg, totalmem, uptime } from "node:os";

import {
  verify,
} from "@node-rs/argon2";

import {
  and,
  desc,
  eq,
  isNull,
  ilike,
  or,
  sql,
} from "drizzle-orm";

import {
  z,
} from "zod";

import {
  requireAuthUser,
} from "../auth/session.js";
import { publicAccountId } from "../auth/public-identity.js";

import {
  db,
} from "../db/client.js";

import {
  marketplaceAdminAuditLogs,
  marketplaceAdmins,
  marketplaceConfig,
  gameSubscriptionGrants,
  gameSubscriptionSettings,
  userSessions,
  sellerProfiles,
  storeCommissionSettings,
  stores,
  users,
} from "../db/schema.js";

export async function getAdmin(
  request: FastifyRequest,
) {
  const user =
    await requireAuthUser(request);

  if (!user) {
    return null;
  }

  const [admin] =
    await db
      .select({
        role: marketplaceAdmins.role,
      })
      .from(marketplaceAdmins)
      .where(
        and(
          eq(marketplaceAdmins.userId, user.id),
          eq(marketplaceAdmins.active, true),
        ),
      )
      .limit(1);

  if (!admin) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
    role: admin.role,
  };
}

export async function reauth(
  request: FastifyRequest,
  password: string,
) {
  const admin =
    await getAdmin(request);

  if (!admin) {
    return null;
  }

  const [row] =
    await db
      .select({
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.id, admin.userId))
      .limit(1);

  if (!row?.passwordHash) {
    return null;
  }

  try {
    const ok =
      await verify(row.passwordHash, password);

    return ok
      ? admin
      : null;
  }
  catch {
    return null;
  }
}

async function audit(
  adminUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  details: unknown,
) {
  await db
    .insert(marketplaceAdminAuditLogs)
    .values({
      adminUserId,
      action,
      entityType,
      entityId,
      details:
        JSON.stringify(details)
          .slice(0, 1800),
    });
}

const sellerParams =
  z.object({
    sellerId: z.string().uuid(),
  });

const moderationBody =
  z.object({
    action:
      z.enum([
        "APPROVE",
        "SUSPEND",
        "REJECT",
      ]),
    password:
      z.string().min(8).max(128),
    reason:
      z.string().trim().min(3).max(500),
  });

const globalCommissionBody =
  z.object({
    commissionBps:
      z.number().int().min(0).max(3000),
    password:
      z.string().min(8).max(128),
    reason:
      z.string().trim().min(3).max(500),
  });

const storeCommissionParams =
  z.object({
    storeId: z.string().uuid(),
  });

const storeCommissionBody =
  z.object({
    commissionBps:
      z.number().int().min(0).max(3000).nullable(),
    password:
      z.string().min(8).max(128),
    reason:
      z.string().trim().min(3).max(500),
  });

export async function registerAdminRoutes(
  app: FastifyInstance,
) {
  app.get("/api/v1/admin/system/health", async (request, reply) => {
    const admin = await getAdmin(request);
    if (!admin || admin.role !== "SUPER_ADMIN") return reply.code(403).send({ error: { code: "ADMIN_FORBIDDEN", message: "Owner access required." } });
    const check = async (url: string) => {
      try { return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok; }
      catch { return false; }
    };
    const [database, web, vtt, voice] = await Promise.all([
      db.execute(sql`select 1`).then(() => true).catch(() => false),
      check("http://127.0.0.1:3100/"),
      check("http://127.0.0.1:4200/api/access-info"),
      check("http://127.0.0.1:7880/"),
    ]);
    const disk = statfsSync("/");
    return { data: {
      sampledAt: new Date().toISOString(),
      uptimeSeconds: uptime(), load1m: loadavg()[0],
      memoryTotalBytes: totalmem(), memoryFreeBytes: freemem(),
      diskTotalBytes: disk.blocks * disk.bsize, diskFreeBytes: disk.bavail * disk.bsize,
      services: { api: true, database, web, vtt, voice },
    } };
  });

  app.get("/api/v1/subscriptions/plan", async () => {
    if (process.env.FREE_LAUNCH_MODE === "true") return { data: { free: true, priceRial: 0, durationDays: null, checkoutAvailable: false, supportUrl: "/support" } };
    const [settings] = await db.select({ priceRial: gameSubscriptionSettings.priceRial })
      .from(gameSubscriptionSettings).where(eq(gameSubscriptionSettings.id, 1)).limit(1);
    return { data: { priceRial: settings?.priceRial ?? 5990000, durationDays: 30, checkoutAvailable: false } };
  });

  const subscriptionChange = z.object({
    email: z.email().max(320).transform(value => value.trim().toLowerCase()),
    password: z.string().min(8).max(128),
    reason: z.string().trim().min(3).max(500),
  });

  app.get("/api/v1/admin/subscriptions", async (request, reply) => {
    const admin = await getAdmin(request);
    if (!admin || admin.role !== "SUPER_ADMIN") return reply.code(403).send({ error: { code: "ADMIN_FORBIDDEN", message: "Owner access required." } });
    const query = z.object({ email: z.string().trim().max(320).default("") }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid search." } });
    const email = query.data.email.toLowerCase();
    const [settings] = await db.select().from(gameSubscriptionSettings).where(eq(gameSubscriptionSettings.id, 1)).limit(1);
    const grants = email ? await db.select({
      id: gameSubscriptionGrants.id, email: gameSubscriptionGrants.email,
      startsAt: gameSubscriptionGrants.startsAt, endsAt: gameSubscriptionGrants.endsAt,
      revokedAt: gameSubscriptionGrants.revokedAt, reason: gameSubscriptionGrants.reason,
      createdAt: gameSubscriptionGrants.createdAt,
    }).from(gameSubscriptionGrants).where(eq(gameSubscriptionGrants.email, email)).orderBy(desc(gameSubscriptionGrants.createdAt)).limit(100) : [];
    const [account] = email ? await db.select({ id: users.id, email: users.email, emailVerified: users.emailVerified, status: users.status })
      .from(users).where(sql`lower(${users.email}) = ${email}`).limit(1) : [];
    return { data: { priceRial: settings?.priceRial ?? 5990000, account: account ?? null, grants } };
  });

  app.post("/api/v1/admin/subscriptions/grants", async (request, reply) => {
    const body = subscriptionChange.extend({ endsAt: z.iso.datetime({ offset: true }) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid grant." } });
    const admin = await reauth(request, body.data.password);
    if (!admin || admin.role !== "SUPER_ADMIN") return reply.code(403).send({ error: { code: "ADMIN_REAUTH_FAILED", message: "Owner password required." } });
    const endsAt = new Date(body.data.endsAt);
    if (endsAt.getTime() <= Date.now()) return reply.code(400).send({ error: { code: "INVALID_END", message: "End time must be in the future." } });
    const [account] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${body.data.email}`).limit(1);
    const grantId = await db.transaction(async tx => {
      const [grant] = await tx.insert(gameSubscriptionGrants).values({
        userId: account?.id ?? null, email: body.data.email, endsAt,
        createdByUserId: admin.userId, reason: body.data.reason,
      }).returning({ id: gameSubscriptionGrants.id });
      if (!grant) throw new Error("Failed to create game subscription grant.");
      await tx.insert(marketplaceAdminAuditLogs).values({
        adminUserId: admin.userId, action: "GRANT_GAME_SUBSCRIPTION", entityType: "USER",
        entityId: account?.id ?? grant.id,
        details: JSON.stringify({ email: body.data.email, endsAt: endsAt.toISOString(), reason: body.data.reason, pending: !account }).slice(0, 1800),
      });
      return grant.id;
    });
    return { data: { id: grantId, pending: !account } };
  });

  app.post("/api/v1/admin/subscriptions/revoke", async (request, reply) => {
    const body = subscriptionChange.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid revocation." } });
    const admin = await reauth(request, body.data.password);
    if (!admin || admin.role !== "SUPER_ADMIN") return reply.code(403).send({ error: { code: "ADMIN_REAUTH_FAILED", message: "Owner password required." } });
    const now = new Date();
    const revoked = await db.transaction(async tx => {
      const rows = await tx.update(gameSubscriptionGrants).set({ revokedAt: now })
        .where(and(eq(gameSubscriptionGrants.email, body.data.email), isNull(gameSubscriptionGrants.revokedAt), sql`${gameSubscriptionGrants.endsAt} > ${now}`))
        .returning({ id: gameSubscriptionGrants.id });
      await tx.insert(marketplaceAdminAuditLogs).values({
        adminUserId: admin.userId, action: "REVOKE_GAME_SUBSCRIPTION", entityType: "EMAIL", entityId: body.data.email.slice(0, 180),
        details: JSON.stringify({ email: body.data.email, count: rows.length, grantIds: rows.map(row => row.id), reason: body.data.reason }).slice(0, 1800),
      });
      return rows.length;
    });
    return { data: { revoked } };
  });

  app.patch("/api/v1/admin/subscriptions/price", async (request, reply) => {
    const body = z.object({ priceToman: z.number().int().min(1).max(100000000), password: z.string().min(8).max(128), reason: z.string().trim().min(3).max(500) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid price." } });
    const admin = await reauth(request, body.data.password);
    if (!admin || admin.role !== "SUPER_ADMIN") return reply.code(403).send({ error: { code: "ADMIN_REAUTH_FAILED", message: "Owner password required." } });
    const priceRial = body.data.priceToman * 10;
    await db.transaction(async tx => {
      const [before] = await tx.select({ priceRial: gameSubscriptionSettings.priceRial }).from(gameSubscriptionSettings).where(eq(gameSubscriptionSettings.id, 1));
      await tx.update(gameSubscriptionSettings).set({ priceRial, updatedByUserId: admin.userId, updatedAt: new Date() }).where(eq(gameSubscriptionSettings.id, 1));
      await tx.insert(marketplaceAdminAuditLogs).values({
        adminUserId: admin.userId, action: "CHANGE_GAME_SUBSCRIPTION_PRICE", entityType: "PLAN", entityId: "1",
        details: JSON.stringify({ before: before?.priceRial, after: priceRial, reason: body.data.reason }).slice(0, 1800),
      });
    });
    return { data: { priceRial } };
  });

  const accountParams = z.object({ userId: z.string().uuid() });
  const accountChange = z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "BANNED"]), password: z.string().min(8).max(128), reason: z.string().trim().min(3).max(500) });
  const roleChange = z.object({ role: z.enum(["SUPER_ADMIN", "MARKETPLACE_ADMIN", "SUPPORT", "NONE"]), password: z.string().min(8).max(128), reason: z.string().trim().min(3).max(500) });

  app.get("/api/v1/admin/accounts", async (request, reply) => {
    const admin = await getAdmin(request);
    if (!admin) return reply.code(403).send({ error: { code: "ADMIN_FORBIDDEN", message: "Admin access required." } });
    const query = z.object({ q: z.string().trim().max(160).optional(), status: z.enum(["ALL", "PENDING_APPROVAL", "ACTIVE", "SUSPENDED", "BANNED"]).default("ALL"), page: z.coerce.number().int().min(1).max(10000).default(1) }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid account search." } });
    const { q, status, page } = query.data;
    const searchTerm = q ? `%${q.replaceAll("%", "\\%").replaceAll("_", "\\_")}%` : null;
    const filters = and(searchTerm ? or(ilike(users.email, searchTerm), ilike(users.username, searchTerm)) : undefined, status === "ALL" ? undefined : eq(users.status, status));
    const [rows, [total], totals] = await Promise.all([
      db.select({ id: users.id, email: users.email, username: users.username, status: users.status, emailVerified: users.emailVerified, createdAt: users.createdAt, updatedAt: users.updatedAt, adminRole: marketplaceAdmins.role, adminActive: marketplaceAdmins.active }).from(users).leftJoin(marketplaceAdmins, eq(marketplaceAdmins.userId, users.id)).where(filters).orderBy(desc(users.createdAt)).limit(30).offset((page - 1) * 30),
      db.select({ count: sql<number>`count(*)::int` }).from(users).where(filters),
      db.select({ status: users.status, count: sql<number>`count(*)::int` }).from(users).groupBy(users.status),
    ]);
    return { data: rows.map(row => ({ ...row, publicId: publicAccountId(row.id) })), total: total?.count ?? 0, page, pageSize: 30, statusCounts: Object.fromEntries(totals.map(row => [row.status, row.count])), admin: { role: admin.role, email: admin.email, userId: admin.userId } };
  });

  app.get<{ Params: { userId: string } }>("/api/v1/admin/accounts/:userId", async (request, reply) => {
    if (!await getAdmin(request)) return reply.code(403).send({ error: { code: "ADMIN_FORBIDDEN", message: "Admin access required." } });
    const params = accountParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid account." } });
    const [account] = await db.select({ id: users.id, email: users.email, username: users.username, status: users.status, emailVerified: users.emailVerified, createdAt: users.createdAt, updatedAt: users.updatedAt, adminRole: marketplaceAdmins.role, adminActive: marketplaceAdmins.active }).from(users).leftJoin(marketplaceAdmins, eq(marketplaceAdmins.userId, users.id)).where(eq(users.id, params.data.userId)).limit(1);
    if (!account) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Account not found." } });
    const [activity] = await db.select({ lastSeenAt: sql<Date | null>`max(${userSessions.lastSeenAt})`, activeSessions: sql<number>`count(*) filter (where ${userSessions.revokedAt} is null and ${userSessions.expiresAt} > now())::int` }).from(userSessions).where(eq(userSessions.userId, account.id));
    return { data: { ...account, publicId: publicAccountId(account.id), lastSeenAt: activity?.lastSeenAt ?? null, activeSessions: activity?.activeSessions ?? 0 } };
  });

  app.patch<{ Params: { userId: string } }>("/api/v1/admin/accounts/:userId/status", async (request, reply) => {
    const params = accountParams.safeParse(request.params);
    const body = accountChange.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid account change." } });
    const admin = await reauth(request, body.data.password);
    if (!admin || admin.role === "SUPPORT") return reply.code(403).send({ error: { code: "ADMIN_REAUTH_FAILED", message: "Admin password and access required." } });
    if (params.data.userId === admin.userId) return reply.code(403).send({ error: { code: "SELF_CHANGE", message: "You cannot change your own account status." } });
    const [target] = await db.select({ id: users.id, email: users.email, status: users.status, adminRole: marketplaceAdmins.role, adminActive: marketplaceAdmins.active }).from(users).leftJoin(marketplaceAdmins, eq(marketplaceAdmins.userId, users.id)).where(eq(users.id, params.data.userId)).limit(1);
    if (!target) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Account not found." } });
    if (target.adminRole && target.adminActive && admin.role !== "SUPER_ADMIN") return reply.code(403).send({ error: { code: "ADMIN_FORBIDDEN", message: "Only a super admin can change an admin account." } });
    await db.transaction(async tx => {
      await tx.update(users).set({ status: body.data.status, updatedAt: new Date() }).where(eq(users.id, target.id));
      if (body.data.status !== "ACTIVE") await tx.update(userSessions).set({ revokedAt: new Date() }).where(and(eq(userSessions.userId, target.id), sql`${userSessions.revokedAt} is null`));
    });
    await audit(admin.userId, "CHANGE_ACCOUNT_STATUS", "USER", target.id, { email: target.email, before: target.status, after: body.data.status, reason: body.data.reason });
    return { data: { id: target.id, status: body.data.status } };
  });

  app.patch<{ Params: { userId: string } }>("/api/v1/admin/accounts/:userId/role", async (request, reply) => {
    const params = accountParams.safeParse(request.params);
    const body = roleChange.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid role change." } });
    const admin = await reauth(request, body.data.password);
    if (!admin || admin.role !== "SUPER_ADMIN") return reply.code(403).send({ error: { code: "ADMIN_REAUTH_FAILED", message: "Super admin password required." } });
    if (params.data.userId === admin.userId) return reply.code(403).send({ error: { code: "SELF_CHANGE", message: "You cannot change your own admin role." } });
    const [target] = await db.select({ id: users.id, email: users.email, status: users.status, adminRole: marketplaceAdmins.role, adminActive: marketplaceAdmins.active }).from(users).leftJoin(marketplaceAdmins, eq(marketplaceAdmins.userId, users.id)).where(eq(users.id, params.data.userId)).limit(1);
    if (!target) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Account not found." } });
    if (body.data.role !== "NONE" && target.status !== "ACTIVE") return reply.code(409).send({ error: { code: "ACCOUNT_INACTIVE", message: "Activate the account before granting an admin role." } });
    if (body.data.role === "NONE") await db.delete(marketplaceAdmins).where(eq(marketplaceAdmins.userId, target.id));
    else await db.insert(marketplaceAdmins).values({ userId: target.id, role: body.data.role, active: true }).onConflictDoUpdate({ target: marketplaceAdmins.userId, set: { role: body.data.role, active: true, updatedAt: new Date() } });
    await audit(admin.userId, "CHANGE_ADMIN_ROLE", "USER", target.id, { email: target.email, before: target.adminActive ? target.adminRole : "NONE", after: body.data.role, reason: body.data.reason });
    return { data: { id: target.id, role: body.data.role } };
  });
  app.get("/api/v1/admin/accounts/pending", async (request, reply) => {
    const admin = await getAdmin(request);
    if (!admin || admin.role === "SUPPORT") {
      return reply.code(403).send({ error: { code: "ADMIN_FORBIDDEN", message: "Admin access required." } });
    }
    const data = await db.select({
      id: users.id,
      email: users.email,
      createdAt: users.createdAt,
    }).from(users).where(eq(users.status, "PENDING_APPROVAL")).orderBy(desc(users.createdAt)).limit(100);
    return { data };
  });

  app.post("/api/v1/admin/accounts/:userId/approve", async (request, reply) => {
    const params = z.object({ userId: z.string().uuid() }).safeParse(request.params);
    const body = z.object({ password: z.string().min(8).max(128) }).safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Invalid approval request." } });
    }
    const admin = await reauth(request, body.data.password);
    if (!admin || admin.role === "SUPPORT") {
      return reply.code(403).send({ error: { code: "ADMIN_REAUTH_FAILED", message: "Admin re-authentication required." } });
    }
    const [approved] = await db.update(users)
      .set({ status: "ACTIVE", updatedAt: new Date() })
      .where(and(eq(users.id, params.data.userId), eq(users.status, "PENDING_APPROVAL")))
      .returning({ id: users.id, email: users.email });
    if (!approved) {
      return reply.code(404).send({ error: { code: "PENDING_ACCOUNT_NOT_FOUND", message: "Pending account not found." } });
    }
    await audit(admin.userId, "APPROVE_ACCOUNT", "USER", approved.id, { email: approved.email });
    return { user: approved, approved: true };
  });

  app.get(
    "/api/v1/admin/marketplace/overview",
    async (request, reply) => {
      const admin =
        await getAdmin(request);

      if (!admin) {
        return reply.code(403).send({
          error: {
            code: "ADMIN_FORBIDDEN",
            message: "Marketplace admin access required.",
          },
        });
      }

      const [config] =
        await db
          .select()
          .from(marketplaceConfig)
          .where(eq(marketplaceConfig.id, "global"))
          .limit(1);

      const allStores =
        await db
          .select({
            id: stores.id,
            sellerProfileId: stores.sellerProfileId,
            slug: stores.slug,
            name: stores.name,
            status: stores.status,
            verified: stores.verified,
          })
          .from(stores)
          .orderBy(desc(stores.createdAt));

      const pending =
        await db
          .select({
            id: sellerProfiles.id,
            displayName: sellerProfiles.displayName,
            status: sellerProfiles.status,
            email: users.email,
          })
          .from(sellerProfiles)
          .innerJoin(users, eq(users.id, sellerProfiles.userId))
          .where(eq(sellerProfiles.status, "PENDING_REVIEW"))
          .orderBy(desc(sellerProfiles.createdAt));

      return {
        admin,
        config: {
          defaultCommissionBps:
            config?.defaultCommissionBps ?? 500,
          defaultCommissionPercent:
            (config?.defaultCommissionBps ?? 500) / 100,
        },
        counts: {
          stores: allStores.length,
          pendingSellers: pending.length,
        },
        stores: allStores,
        pendingSellers: pending,
        source: "postgresql" as const,
      };
    },
  );

  app.get(
    "/api/v1/admin/audit",
    async (request, reply) => {
      const admin =
        await getAdmin(request);

      if (!admin) {
        return reply.code(403).send({
          error: {
            code: "ADMIN_FORBIDDEN",
            message: "Marketplace admin access required.",
          },
        });
      }

      const rows =
        await db
          .select()
          .from(marketplaceAdminAuditLogs)
          .orderBy(desc(marketplaceAdminAuditLogs.createdAt))
          .limit(100);

      return {
        data: rows,
        source: "postgresql" as const,
      };
    },
  );

  app.post(
    "/api/v1/admin/marketplace/sellers/:sellerId/moderate",
    async (request, reply) => {
      const params =
        sellerParams.safeParse(request.params);

      const body =
        moderationBody.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid moderation request.",
          },
        });
      }

      const admin =
        await reauth(
          request,
          body.data.password,
        );

      if (
        !admin ||
        admin.role === "SUPPORT"
      ) {
        return reply.code(403).send({
          error: {
            code: "ADMIN_REAUTH_FAILED",
            message: "Admin re-authentication with sufficient role is required.",
          },
        });
      }

      const sellerStatus =
        body.data.action === "APPROVE"
          ? "ACTIVE"
          : body.data.action === "SUSPEND"
            ? "SUSPENDED"
            : "REJECTED";

      const storeStatus =
        body.data.action === "APPROVE"
          ? "ACTIVE"
          : body.data.action === "SUSPEND"
            ? "SUSPENDED"
            : "ARCHIVED";

      const updated =
        await db.transaction(
          async (tx) => {
            const sellerRows =
              await tx
                .update(sellerProfiles)
                .set({
                  status: sellerStatus,
                  updatedAt: new Date(),
                })
                .where(eq(sellerProfiles.id, params.data.sellerId))
                .returning({ id: sellerProfiles.id });

            if (sellerRows.length !== 1) {
              return false;
            }

            await tx
              .update(stores)
              .set({
                status: storeStatus,
                updatedAt: new Date(),
              })
              .where(eq(stores.sellerProfileId, params.data.sellerId));

            return true;
          },
        );

      if (!updated) {
        return reply.code(404).send({
          error: {
            code: "SELLER_NOT_FOUND",
            message: "Seller was not found.",
          },
        });
      }

      await audit(
        admin.userId,
        `SELLER_${body.data.action}`,
        "seller_profile",
        params.data.sellerId,
        { reason: body.data.reason },
      );

      return {
        ok: true,
        sellerStatus,
        storeStatus,
        source: "postgresql" as const,
      };
    },
  );

  app.patch(
    "/api/v1/admin/marketplace/config/commission",
    async (request, reply) => {
      const body =
        globalCommissionBody.safeParse(request.body);

      if (!body.success) {
        return reply.code(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid commission request.",
          },
        });
      }

      const admin =
        await reauth(
          request,
          body.data.password,
        );

      if (
        !admin ||
        admin.role === "SUPPORT"
      ) {
        return reply.code(403).send({
          error: {
            code: "ADMIN_REAUTH_FAILED",
            message: "Admin re-authentication with sufficient role is required.",
          },
        });
      }

      await db
        .update(marketplaceConfig)
        .set({
          defaultCommissionBps:
            body.data.commissionBps,
          updatedAt: new Date(),
        })
        .where(eq(marketplaceConfig.id, "global"));

      await audit(
        admin.userId,
        "GLOBAL_COMMISSION_UPDATE",
        "marketplace_config",
        "global",
        {
          commissionBps:
            body.data.commissionBps,
          reason:
            body.data.reason,
        },
      );

      return {
        ok: true,
        commissionBps:
          body.data.commissionBps,
        commissionPercent:
          body.data.commissionBps / 100,
        source: "postgresql" as const,
      };
    },
  );

  app.put(
    "/api/v1/admin/marketplace/stores/:storeId/commission",
    async (request, reply) => {
      const params =
        storeCommissionParams.safeParse(request.params);

      const body =
        storeCommissionBody.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid store commission request.",
          },
        });
      }

      const admin =
        await reauth(
          request,
          body.data.password,
        );

      if (
        !admin ||
        admin.role === "SUPPORT"
      ) {
        return reply.code(403).send({
          error: {
            code: "ADMIN_REAUTH_FAILED",
            message: "Admin re-authentication with sufficient role is required.",
          },
        });
      }

      const [store] =
        await db
          .select({ id: stores.id })
          .from(stores)
          .where(eq(stores.id, params.data.storeId))
          .limit(1);

      if (!store) {
        return reply.code(404).send({
          error: {
            code: "STORE_NOT_FOUND",
            message: "Store was not found.",
          },
        });
      }

      const [existing] =
        await db
          .select()
          .from(storeCommissionSettings)
          .where(eq(storeCommissionSettings.storeId, store.id))
          .limit(1);

      if (body.data.commissionBps === null) {
        if (existing) {
          await db
            .update(storeCommissionSettings)
            .set({
              active: false,
              reason: body.data.reason,
              updatedAt: new Date(),
            })
            .where(eq(storeCommissionSettings.storeId, store.id));
        }
      }
      else if (existing) {
        await db
          .update(storeCommissionSettings)
          .set({
            commissionBps: body.data.commissionBps,
            active: true,
            reason: body.data.reason,
            updatedAt: new Date(),
          })
          .where(eq(storeCommissionSettings.storeId, store.id));
      }
      else {
        await db
          .insert(storeCommissionSettings)
          .values({
            storeId: store.id,
            commissionBps: body.data.commissionBps,
            active: true,
            reason: body.data.reason,
          });
      }

      await audit(
        admin.userId,
        body.data.commissionBps === null
          ? "STORE_COMMISSION_CLEAR"
          : "STORE_COMMISSION_UPDATE",
        "store",
        store.id,
        {
          commissionBps:
            body.data.commissionBps,
          reason:
            body.data.reason,
        },
      );

      return {
        ok: true,
        storeId: store.id,
        commissionBps:
          body.data.commissionBps,
        source: "postgresql" as const,
      };
    },
  );
}
