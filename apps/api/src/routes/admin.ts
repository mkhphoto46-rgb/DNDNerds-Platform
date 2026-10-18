import type {
  FastifyInstance,
  FastifyRequest,
} from "fastify";

import {
  verify,
} from "@node-rs/argon2";

import {
  and,
  desc,
  eq,
} from "drizzle-orm";

import {
  z,
} from "zod";

import {
  requireAuthUser,
} from "../auth/session.js";

import {
  db,
} from "../db/client.js";

import {
  marketplaceAdminAuditLogs,
  marketplaceAdmins,
  marketplaceConfig,
  sellerProfiles,
  storeCommissionSettings,
  stores,
  users,
} from "../db/schema.js";

async function getAdmin(
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

async function reauth(
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
      z.string().min(12).max(128),
    reason:
      z.string().trim().min(3).max(500),
  });

const globalCommissionBody =
  z.object({
    commissionBps:
      z.number().int().min(0).max(3000),
    password:
      z.string().min(12).max(128),
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
      z.string().min(12).max(128),
    reason:
      z.string().trim().min(3).max(500),
  });

export async function registerAdminRoutes(
  app: FastifyInstance,
) {
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