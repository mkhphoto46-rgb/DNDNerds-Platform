import type {
  FastifyInstance,
} from "fastify";

import {
  verify,
} from "@node-rs/argon2";

import {
  and,
  desc,
  eq,
  inArray,
  sql,
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
  marketplaceOrders,
  marketplaceRefundCaseEvidence,
  marketplaceRefundCaseEvents,
  marketplaceRefundCases,
  marketplaceRefundPolicy,
  marketplaceSellerOrders,
  storeMembers,
  users,
} from "../db/schema.js";

import {
  detectEvidenceImageMimeType,
  extensionForEvidenceMime,
  normalizeEvidenceOriginalName,
  openPrivateEvidenceStream,
  REFUND_EVIDENCE_MAX_FILES_PER_CASE,
  removePrivateEvidence,
  storePrivateEvidence,
} from "../refunds/evidence-storage.js";

import {
  adminDecisionStatus,
  canAdminDecide,
  canSellerRespond,
  sellerResponseDeadline,
} from "../refunds/case-workflow.js";

import { executeSellerOrderRefundCase } from "../refunds/seller-order-refund-execution.js";
import { PaymentDomainError } from "../payments/payment-service.js";

import {
  buildSellerOrderRefundPlan,
  hasCompleteRefundPlan,
} from "../refunds/seller-order-refund-plan.js";

const sellerOrderParams =
  z.object({
    sellerOrderId:
      z.string().uuid(),
  });

const caseParams =
  z.object({
    caseId:
      z.string().uuid(),
  });

const evidenceParams =
  z.object({
    caseId:
      z.string().uuid(),

    evidenceId:
      z.string().uuid(),
  });

const createBody =
  z.object({
    reason:
      z.enum([
        "DAMAGED",
        "DEFECTIVE",
        "WRONG_ITEM",
        "MISSING_ITEM",
        "NOT_AS_DESCRIBED",
        "OTHER",
      ]),

    description:
      z.string()
        .trim()
        .min(30)
        .max(4000),
  });

const contactConfirmationBody =
  z.object({
    password:
      z.string()
        .min(8)
        .max(128),

    note:
      z.string()
        .trim()
        .min(3)
        .max(800),
  });

const sellerResponseBody =
  z.object({
    response:
      z.string()
        .trim()
        .min(10)
        .max(4000),
  });

const adminDecisionBody =
  z.object({
    action:
      z.enum([
        "APPROVE",
        "REJECT",
      ]),

    returnRequired:
      z.boolean()
        .default(false),

    password:
      z.string()
        .min(8)
        .max(128),

    reason:
      z.string()
        .trim()
        .min(5)
        .max(1200),
  });

const returnConfirmationBody =
  z.object({
    password:
      z.string()
        .min(8)
        .max(128),

    note:
      z.string()
        .trim()
        .min(3)
        .max(1200),
  });

const ACTIVE_CASE_STATES = [
  "REQUESTED",
  "EVIDENCE_REQUIRED",
  "CONTACT_REQUIRED",
  "UNDER_REVIEW",
  "SELLER_RESPONSE",
  "RETURN_REQUIRED",
  "APPROVED",
  "REFUND_PROCESSING",
] as const;

const ELIGIBLE_SELLER_ORDER_STATES = [
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
] as const;

function publicCase(
  refundCase:
    typeof marketplaceRefundCases
      .$inferSelect,
) {
  return {
    id:
      refundCase.id,

    orderId:
      refundCase.orderId,

    sellerOrderId:
      refundCase.sellerOrderId,

    storeId:
      refundCase.storeId,

    reason:
      refundCase.reason,

    description:
      refundCase.description,

    status:
      refundCase.status,

    contactConfirmed:
      refundCase.contactConfirmedAt !==
      null,

    sellerResponded:
      refundCase.sellerRespondedAt !==
      null,

    sellerResponseDueAt:
      refundCase.sellerResponseDueAt,

    refundAmountRial:
      refundCase.refundAmountRial,

    returnRequired:
      refundCase.returnRequired,

    returnReceivedAt:
      refundCase.returnReceivedAt,

    createdAt:
      refundCase.createdAt,

    updatedAt:
      refundCase.updatedAt,
  };
}

async function caseAccess(
  userId:
    string,
  caseId:
    string,
) {
  const [refundCase] =
    await db
      .select()
      .from(
        marketplaceRefundCases,
      )
      .where(
        eq(
          marketplaceRefundCases.id,
          caseId,
        ),
      )
      .limit(1);

  if (!refundCase) {
    return null;
  }

  if (
    refundCase.buyerUserId ===
      userId
  ) {
    return {
      refundCase,

      role:
        "BUYER" as const,
    };
  }

  const [admin] =
    await db
      .select({
        role:
          marketplaceAdmins.role,
      })
      .from(
        marketplaceAdmins,
      )
      .where(
        and(
          eq(
            marketplaceAdmins.userId,
            userId,
          ),

          eq(
            marketplaceAdmins.active,
            true,
          ),
        ),
      )
      .limit(1);

  if (admin) {
    return {
      refundCase,

      role:
        "ADMIN" as const,
    };
  }

  const [member] =
    await db
      .select({
        role:
          storeMembers.role,
      })
      .from(
        storeMembers,
      )
      .where(
        and(
          eq(
            storeMembers.userId,
            userId,
          ),

          eq(
            storeMembers.storeId,
            refundCase.storeId,
          ),
        ),
      )
      .limit(1);

  if (
    member &&
    [
      "OWNER",
      "MANAGER",
      "ORDER_MANAGER",
    ].includes(
      member.role,
    )
  ) {
    return {
      refundCase,

      role:
        "SELLER" as const,
    };
  }

  return null;
}

function normalizeDeclaredImageMime(
  mimeType:
    string,
) {
  return (
    mimeType ===
      "image/jpg"
      ? "image/jpeg"
      : mimeType
  );
}

async function reauthMarketplaceStaff(
  userId:
    string,
  password:
    string,
  allowSupport:
    boolean,
) {
  const [admin] =
    await db
      .select({
        role:
          marketplaceAdmins.role,
      })
      .from(
        marketplaceAdmins,
      )
      .where(
        and(
          eq(
            marketplaceAdmins.userId,
            userId,
          ),

          eq(
            marketplaceAdmins.active,
            true,
          ),
        ),
      )
      .limit(1);

  if (
    !admin ||
    (
      !allowSupport &&
      admin.role ===
        "SUPPORT"
    )
  ) {
    return null;
  }

  const [account] =
    await db
      .select({
        passwordHash:
          users.passwordHash,
      })
      .from(
        users,
      )
      .where(
        eq(
          users.id,
          userId,
        ),
      )
      .limit(1);

  if (!account?.passwordHash) {
    return null;
  }

  try {
    const valid =
      await verify(
        account.passwordHash,
        password,
      );

    return valid
      ? {
          userId,

          role:
            admin.role,
        }
      : null;
  }
  catch {
    return null;
  }
}

async function writeAdminRefundAudit(
  adminUserId:
    string,
  action:
    string,
  caseId:
    string,
  details:
    unknown,
) {
  await db
    .insert(
      marketplaceAdminAuditLogs,
    )
    .values({
      adminUserId,

      action,

      entityType:
        "marketplace_refund_case",

      entityId:
        caseId,

      details:
        JSON.stringify(
          details,
        ).slice(
          0,
          1800,
        ),
    });
}

export async function registerRefundCaseRoutes(
  app:
    FastifyInstance,
) {
  app.post(
    "/api/v1/marketplace/seller-orders/:sellerOrderId/refund-cases",
    async (
      request,
      reply,
    ) => {
      const user =
        await requireAuthUser(
          request,
        );

      const params =
        sellerOrderParams.safeParse(
          request.params,
        );

      const body =
        createBody.safeParse(
          request.body,
        );

      if (!user) {
        return reply
          .code(401)
          .send({
            error: {
              code:
                "UNAUTHORIZED",

              message:
                "Authentication required.",
            },
          });
      }

      if (
        !params.success ||
        !body.success
      ) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Refund review request requires a valid reason and detailed description.",
            },
          });
      }

      try {
        const result =
          await db.transaction(
            async tx => {
              await tx.execute(
                sql`
                  SELECT pg_advisory_xact_lock(
                    hashtextextended(
                      ${`refund-case:${params.data.sellerOrderId}`},
                      0
                    )
                  )
                `,
              );

              const [sellerOrder] =
                await tx
                  .select({
                    sellerOrderId:
                      marketplaceSellerOrders.id,

                    orderId:
                      marketplaceSellerOrders.orderId,

                    storeId:
                      marketplaceSellerOrders.storeId,

                    sellerOrderStatus:
                      marketplaceSellerOrders.status,

                    buyerUserId:
                      marketplaceOrders.userId,
                  })
                  .from(
                    marketplaceSellerOrders,
                  )
                  .innerJoin(
                    marketplaceOrders,
                    eq(
                      marketplaceOrders.id,
                      marketplaceSellerOrders.orderId,
                    ),
                  )
                  .where(
                    and(
                      eq(
                        marketplaceSellerOrders.id,
                        params.data.sellerOrderId,
                      ),

                      eq(
                        marketplaceOrders.userId,
                        user.id,
                      ),
                    ),
                  )
                  .limit(1);

              if (!sellerOrder) {
                throw new Error(
                  "SELLER_ORDER_NOT_FOUND",
                );
              }

              if (
                !ELIGIBLE_SELLER_ORDER_STATES.includes(
                  sellerOrder.sellerOrderStatus as
                    typeof ELIGIBLE_SELLER_ORDER_STATES[number],
                )
              ) {
                throw new Error(
                  "REFUND_CASE_NOT_ELIGIBLE",
                );
              }

              const [existing] =
                await tx
                  .select()
                  .from(
                    marketplaceRefundCases,
                  )
                  .where(
                    and(
                      eq(
                        marketplaceRefundCases.sellerOrderId,
                        sellerOrder.sellerOrderId,
                      ),

                      inArray(
                        marketplaceRefundCases.status,
                        [
                          ...ACTIVE_CASE_STATES,
                        ],
                      ),
                    ),
                  )
                  .orderBy(
                    desc(
                      marketplaceRefundCases.createdAt,
                    ),
                  )
                  .limit(1);

              if (existing) {
                return {
                  refundCase:
                    existing,

                  idempotent:
                    true,
                };
              }

              const [created] =
                await tx
                  .insert(
                    marketplaceRefundCases,
                  )
                  .values({
                    orderId:
                      sellerOrder.orderId,

                    sellerOrderId:
                      sellerOrder.sellerOrderId,

                    storeId:
                      sellerOrder.storeId,

                    buyerUserId:
                      user.id,

                    reason:
                      body.data.reason,

                    description:
                      body.data.description,

                    status:
                      "EVIDENCE_REQUIRED",

                    updatedAt:
                      new Date(),
                  })
                  .returning();

              if (!created) {
                throw new Error(
                  "REFUND_CASE_CREATE_FAILED",
                );
              }

              await tx
                .insert(
                  marketplaceRefundCaseEvents,
                )
                .values({
                  caseId:
                    created.id,

                  actorUserId:
                    user.id,

                  actorRole:
                    "BUYER",

                  eventType:
                    "CASE_OPENED",

                  details:
                    JSON.stringify({
                      reason:
                        created.reason,

                      nextRequiredStep:
                        "EVIDENCE_UPLOAD",
                    }).slice(
                      0,
                      1800,
                    ),
                });

              return {
                refundCase:
                  created,

                idempotent:
                  false,
              };
            },
          );

        return reply
          .code(
            result.idempotent
              ? 200
              : 201,
          )
          .send({
            refundCase:
              publicCase(
                result.refundCase,
              ),

            requirements: {
              evidenceRequired:
                true,

              supportContactRequired:
                true,

              automaticRefund:
                false,

              directFinancialRefund:
                false,
            },

            idempotent:
              result.idempotent,

            source:
              "postgresql",
          });
      }
      catch (error) {
        if (
          error instanceof Error &&
          error.message ===
            "SELLER_ORDER_NOT_FOUND"
        ) {
          return reply
            .code(404)
            .send({
              error: {
                code:
                  "SELLER_ORDER_NOT_FOUND",

                message:
                  "Seller order was not found for this buyer.",
              },
            });
        }

        if (
          error instanceof Error &&
          error.message ===
            "REFUND_CASE_NOT_ELIGIBLE"
        ) {
          return reply
            .code(409)
            .send({
              error: {
                code:
                  "REFUND_CASE_NOT_ELIGIBLE",

                message:
                  "This seller order is not eligible to open a refund review case in its current state.",
              },
            });
        }

        throw error;
      }
    },
  );

  app.get(
    "/api/v1/marketplace/refund-cases",
    async (
      request,
      reply,
    ) => {
      const user =
        await requireAuthUser(
          request,
        );

      if (!user) {
        return reply
          .code(401)
          .send({
            error: {
              code:
                "UNAUTHORIZED",

              message:
                "Authentication required.",
            },
          });
      }

      const rows =
        await db
          .select()
          .from(
            marketplaceRefundCases,
          )
          .where(
            eq(
              marketplaceRefundCases.buyerUserId,
              user.id,
            ),
          )
          .orderBy(
            desc(
              marketplaceRefundCases.createdAt,
            ),
          );

      return {
        data:
          rows.map(
            publicCase,
          ),

        source:
          "postgresql" as const,
      };
    },
  );

  app.get(
    "/api/v1/marketplace/refund-cases/:caseId",
    async (
      request,
      reply,
    ) => {
      const user =
        await requireAuthUser(
          request,
        );

      const params =
        caseParams.safeParse(
          request.params,
        );

      if (!user) {
        return reply
          .code(401)
          .send({
            error: {
              code:
                "UNAUTHORIZED",

              message:
                "Authentication required.",
            },
          });
      }

      if (!params.success) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Invalid refund case id.",
            },
          });
      }

      const [row] =
        await db
          .select()
          .from(
            marketplaceRefundCases,
          )
          .where(
            and(
              eq(
                marketplaceRefundCases.id,
                params.data.caseId,
              ),

              eq(
                marketplaceRefundCases.buyerUserId,
                user.id,
              ),
            ),
          )
          .limit(1);

      if (!row) {
        return reply
          .code(404)
          .send({
            error: {
              code:
                "REFUND_CASE_NOT_FOUND",

              message:
                "Refund case was not found.",
            },
          });
      }

      return {
        refundCase:
          publicCase(
            row,
          ),

        source:
          "postgresql" as const,
      };
    },
  );

  app.post(
    "/api/v1/marketplace/refund-cases/:caseId/evidence",
    async (
      request,
      reply,
    ) => {
      const user =
        await requireAuthUser(
          request,
        );

      const params =
        caseParams.safeParse(
          request.params,
        );

      if (!user) {
        return reply
          .code(401)
          .send({
            error: {
              code:
                "UNAUTHORIZED",

              message:
                "Authentication required.",
            },
          });
      }

      if (!params.success) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Invalid refund case id.",
            },
          });
      }

      const access =
        await caseAccess(
          user.id,
          params.data.caseId,
        );

      if (
        !access ||
        access.role !==
          "BUYER"
      ) {
        return reply
          .code(403)
          .send({
            error: {
              code:
                "REFUND_EVIDENCE_BUYER_ONLY",

              message:
                "Only the buyer who opened this case may upload buyer evidence.",
            },
          });
      }

      if (
        ![
          "REQUESTED",
          "EVIDENCE_REQUIRED",
          "CONTACT_REQUIRED",
          "UNDER_REVIEW",
          "SELLER_RESPONSE",
        ].includes(
          access.refundCase.status,
        )
      ) {
        return reply
          .code(409)
          .send({
            error: {
              code:
                "REFUND_CASE_EVIDENCE_CLOSED",

              message:
                "Evidence can no longer be added to this refund case.",
            },
          });
      }

      let part:
        Awaited<
          ReturnType<
            typeof request.file
          >
        >;

      try {
        part =
          await request.file();
      }
      catch (error) {
        const statusCode =
          typeof error ===
            "object" &&
          error !==
            null &&
          "statusCode" in
            error &&
          typeof (
            error as {
              statusCode?: unknown;
            }
          ).statusCode ===
            "number"
            ? (
                error as {
                  statusCode: number;
                }
              ).statusCode
            : 400;

        return reply
          .code(
            statusCode ===
              413
              ? 413
              : 400,
          )
          .send({
            error: {
              code:
                statusCode ===
                  413
                  ? "EVIDENCE_FILE_TOO_LARGE"
                  : "EVIDENCE_MULTIPART_INVALID",

              message:
                statusCode ===
                  413
                  ? "Evidence image exceeds the upload size limit."
                  : "Evidence upload must be a valid multipart image upload.",
            },
          });
      }

      if (!part) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "EVIDENCE_FILE_REQUIRED",

              message:
                "An evidence image file is required.",
            },
          });
      }

      let bytes:
        Buffer;

      try {
        bytes =
          await part.toBuffer();
      }
      catch (error) {
        const statusCode =
          typeof error ===
            "object" &&
          error !==
            null &&
          "statusCode" in
            error &&
          typeof (
            error as {
              statusCode?: unknown;
            }
          ).statusCode ===
            "number"
            ? (
                error as {
                  statusCode: number;
                }
              ).statusCode
            : 400;

        return reply
          .code(
            statusCode ===
              413
              ? 413
              : 400,
          )
          .send({
            error: {
              code:
                statusCode ===
                  413
                  ? "EVIDENCE_FILE_TOO_LARGE"
                  : "EVIDENCE_FILE_READ_FAILED",

              message:
                statusCode ===
                  413
                  ? "Evidence image exceeds the upload size limit."
                  : "Evidence image could not be read safely.",
            },
          });
      }

      const detectedMime =
        detectEvidenceImageMimeType(
          bytes,
        );

      const declaredMime =
        normalizeDeclaredImageMime(
          part.mimetype,
        );

      if (
        !detectedMime ||
        declaredMime !==
          detectedMime
      ) {
        return reply
          .code(415)
          .send({
            error: {
              code:
                "EVIDENCE_IMAGE_TYPE_INVALID",

              message:
                "Only valid JPEG, PNG, or WEBP evidence images are accepted.",
            },
          });
      }

      let storedStorageKey:
        string |
        null =
          null;

      try {
        const result =
          await db.transaction(
            async tx => {
              await tx.execute(
                sql`
                  SELECT pg_advisory_xact_lock(
                    hashtextextended(
                      ${`refund-case-evidence:${access.refundCase.id}`},
                      0
                    )
                  )
                `,
              );

              const existing =
                await tx
                  .select({
                    id:
                      marketplaceRefundCaseEvidence.id,
                  })
                  .from(
                    marketplaceRefundCaseEvidence,
                  )
                  .where(
                    eq(
                      marketplaceRefundCaseEvidence.caseId,
                      access.refundCase.id,
                    ),
                  );

              if (
                existing.length >=
                REFUND_EVIDENCE_MAX_FILES_PER_CASE
              ) {
                throw new Error(
                  "EVIDENCE_FILE_LIMIT_REACHED",
                );
              }

              const stored =
                await storePrivateEvidence({
                  caseId:
                    access.refundCase.id,

                  bytes,

                  mimeType:
                    detectedMime,
                });

              storedStorageKey =
                stored.storageKey;

              const [evidence] =
                await tx
                  .insert(
                    marketplaceRefundCaseEvidence,
                  )
                  .values({
                    caseId:
                      access.refundCase.id,

                    uploadedByUserId:
                      user.id,

                    storageKey:
                      stored.storageKey,

                    originalName:
                      normalizeEvidenceOriginalName(
                        part.filename,
                      ),

                    mimeType:
                      stored.mimeType,

                    sizeBytes:
                      stored.sizeBytes,

                    sha256:
                      stored.sha256,
                  })
                  .returning();

              if (!evidence) {
                throw new Error(
                  "EVIDENCE_METADATA_CREATE_FAILED",
                );
              }

              const [policy] =
                await tx
                  .select()
                  .from(
                    marketplaceRefundPolicy,
                  )
                  .where(
                    eq(
                      marketplaceRefundPolicy.id,
                      "default",
                    ),
                  )
                  .limit(1);

              const minimum =
                Math.max(
                  policy
                    ?.minimumEvidenceCount ??
                    1,
                  1,
                );

              const evidenceCount =
                existing.length +
                1;

              let nextStatus =
                access.refundCase.status;

              if (
                evidenceCount >=
                  minimum &&
                access.refundCase.status ===
                  "EVIDENCE_REQUIRED"
              ) {
                nextStatus =
                  policy
                    ?.supportContactRequired ===
                    false
                    ? "UNDER_REVIEW"
                    : "CONTACT_REQUIRED";

                await tx
                  .update(
                    marketplaceRefundCases,
                  )
                  .set({
                    status:
                      nextStatus,

                    updatedAt:
                      new Date(),
                  })
                  .where(
                    eq(
                      marketplaceRefundCases.id,
                      access.refundCase.id,
                    ),
                  );
              }

              await tx
                .insert(
                  marketplaceRefundCaseEvents,
                )
                .values({
                  caseId:
                    access.refundCase.id,

                  actorUserId:
                    user.id,

                  actorRole:
                    "BUYER",

                  eventType:
                    "EVIDENCE_ADDED",

                  details:
                    JSON.stringify({
                      evidenceId:
                        evidence.id,

                      mimeType:
                        evidence.mimeType,

                      sizeBytes:
                        evidence.sizeBytes,

                      sha256:
                        evidence.sha256,

                      evidenceCount,

                      nextStatus,
                    }).slice(
                      0,
                      1800,
                    ),
                });

              return {
                evidence,

                evidenceCount,

                nextStatus,
              };
            },
          );

        return reply
          .code(201)
          .send({
            evidence: {
              id:
                result.evidence.id,

              originalName:
                result.evidence.originalName,

              mimeType:
                result.evidence.mimeType,

              sizeBytes:
                result.evidence.sizeBytes,

              sha256:
                result.evidence.sha256,

              createdAt:
                result.evidence.createdAt,
            },

            evidenceCount:
              result.evidenceCount,

            caseStatus:
              result.nextStatus,

            private:
              true,

            source:
              "postgresql",
          });
      }
      catch (error) {
        if (
          storedStorageKey
        ) {
          try {
            await removePrivateEvidence(
              storedStorageKey,
            );
          }
          catch {
            request.log.error(
              {
                caseId:
                  access.refundCase.id,

                evidenceStorageCleanup:
                  "failed",
              },
              "Refund evidence compensation cleanup failed",
            );
          }
        }

        if (
          error instanceof Error &&
          error.message ===
            "EVIDENCE_FILE_LIMIT_REACHED"
        ) {
          return reply
            .code(409)
            .send({
              error: {
                code:
                  "EVIDENCE_FILE_LIMIT_REACHED",

                message:
                  "The maximum number of evidence images has been reached for this case.",
              },
            });
        }

        throw error;
      }
    },
  );

  app.get(
    "/api/v1/marketplace/refund-cases/:caseId/evidence",
    async (
      request,
      reply,
    ) => {
      const user =
        await requireAuthUser(
          request,
        );

      const params =
        caseParams.safeParse(
          request.params,
        );

      if (!user) {
        return reply
          .code(401)
          .send({
            error: {
              code:
                "UNAUTHORIZED",

              message:
                "Authentication required.",
            },
          });
      }

      if (!params.success) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Invalid refund case id.",
            },
          });
      }

      const access =
        await caseAccess(
          user.id,
          params.data.caseId,
        );

      if (!access) {
        return reply
          .code(404)
          .send({
            error: {
              code:
                "REFUND_CASE_NOT_FOUND",

              message:
                "Refund case was not found.",
            },
          });
      }

      const rows =
        await db
          .select({
            id:
              marketplaceRefundCaseEvidence.id,

            originalName:
              marketplaceRefundCaseEvidence.originalName,

            mimeType:
              marketplaceRefundCaseEvidence.mimeType,

            sizeBytes:
              marketplaceRefundCaseEvidence.sizeBytes,

            sha256:
              marketplaceRefundCaseEvidence.sha256,

            createdAt:
              marketplaceRefundCaseEvidence.createdAt,
          })
          .from(
            marketplaceRefundCaseEvidence,
          )
          .where(
            eq(
              marketplaceRefundCaseEvidence.caseId,
              access.refundCase.id,
            ),
          )
          .orderBy(
            marketplaceRefundCaseEvidence.createdAt,
          );

      return {
        data:
          rows,

        accessRole:
          access.role,

        private:
          true,

        source:
          "postgresql" as const,
      };
    },
  );

  app.get(
    "/api/v1/marketplace/refund-cases/:caseId/evidence/:evidenceId/content",
    async (
      request,
      reply,
    ) => {
      const user =
        await requireAuthUser(
          request,
        );

      const params =
        evidenceParams.safeParse(
          request.params,
        );

      if (!user) {
        return reply
          .code(401)
          .send({
            error: {
              code:
                "UNAUTHORIZED",

              message:
                "Authentication required.",
            },
          });
      }

      if (!params.success) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Invalid evidence request.",
            },
          });
      }

      const access =
        await caseAccess(
          user.id,
          params.data.caseId,
        );

      if (!access) {
        return reply
          .code(404)
          .send({
            error: {
              code:
                "REFUND_CASE_NOT_FOUND",

              message:
                "Refund case was not found.",
            },
          });
      }

      const [evidence] =
        await db
          .select()
          .from(
            marketplaceRefundCaseEvidence,
          )
          .where(
            and(
              eq(
                marketplaceRefundCaseEvidence.id,
                params.data.evidenceId,
              ),

              eq(
                marketplaceRefundCaseEvidence.caseId,
                access.refundCase.id,
              ),
            ),
          )
          .limit(1);

      if (!evidence) {
        return reply
          .code(404)
          .send({
            error: {
              code:
                "REFUND_EVIDENCE_NOT_FOUND",

              message:
                "Refund evidence was not found.",
            },
          });
      }

      const extension =
        extensionForEvidenceMime(
          evidence.mimeType,
        );

      reply.header(
        "Content-Type",
        evidence.mimeType,
      );

      reply.header(
        "Cache-Control",
        "private, no-store, max-age=0",
      );

      reply.header(
        "X-Content-Type-Options",
        "nosniff",
      );

      reply.header(
        "Content-Disposition",
        `inline; filename="evidence-${evidence.id}${extension}"`,
      );

      return reply.send(
        openPrivateEvidenceStream(
          evidence.storageKey,
        ),
      );
    },
  );

  app.post(
    "/api/v1/admin/marketplace/refund-cases/:caseId/confirm-contact",
    async (
      request,
      reply,
    ) => {
      const user =
        await requireAuthUser(
          request,
        );

      const params =
        caseParams.safeParse(
          request.params,
        );

      const body =
        contactConfirmationBody.safeParse(
          request.body,
        );

      if (!user) {
        return reply
          .code(401)
          .send({
            error: {
              code:
                "UNAUTHORIZED",

              message:
                "Authentication required.",
            },
          });
      }

      if (
        !params.success ||
        !body.success
      ) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "A valid case id, password and contact note are required.",
            },
          });
      }

      const staff =
        await reauthMarketplaceStaff(
          user.id,
          body.data.password,
          true,
        );

      if (!staff) {
        return reply
          .code(403)
          .send({
            error: {
              code:
                "ADMIN_REAUTH_FAILED",

              message:
                "Marketplace staff re-authentication failed.",
            },
          });
      }

      try {
        const result =
          await db.transaction(
            async tx => {
              await tx.execute(
                sql`
                  SELECT pg_advisory_xact_lock(
                    hashtextextended(
                      ${`refund-case:${params.data.caseId}`},
                      0
                    )
                  )
                `,
              );

              const [refundCase] =
                await tx
                  .select()
                  .from(
                    marketplaceRefundCases,
                  )
                  .where(
                    eq(
                      marketplaceRefundCases.id,
                      params.data.caseId,
                    ),
                  )
                  .limit(1);

              if (!refundCase) {
                throw new Error(
                  "REFUND_CASE_NOT_FOUND",
                );
              }

              if (
                refundCase.status !==
                  "CONTACT_REQUIRED" ||
                refundCase.contactConfirmedAt !==
                  null
              ) {
                throw new Error(
                  "REFUND_CASE_CONTACT_STATE_INVALID",
                );
              }

              const [policy] =
                await tx
                  .select()
                  .from(
                    marketplaceRefundPolicy,
                  )
                  .where(
                    eq(
                      marketplaceRefundPolicy.id,
                      "default",
                    ),
                  )
                  .limit(1);

              const evidenceRows =
                await tx
                  .select({
                    id:
                      marketplaceRefundCaseEvidence.id,
                  })
                  .from(
                    marketplaceRefundCaseEvidence,
                  )
                  .where(
                    eq(
                      marketplaceRefundCaseEvidence.caseId,
                      refundCase.id,
                    ),
                  );

              const minimumEvidence =
                Math.max(
                  policy
                    ?.minimumEvidenceCount ??
                    1,
                  1,
                );

              if (
                evidenceRows.length <
                minimumEvidence
              ) {
                throw new Error(
                  "REFUND_CASE_EVIDENCE_INCOMPLETE",
                );
              }

              const now =
                new Date();

              const responseHours =
                policy
                  ?.sellerResponseHours ??
                  48;

              const dueAt =
                sellerResponseDeadline(
                  now,
                  responseHours,
                );

              const [updated] =
                await tx
                  .update(
                    marketplaceRefundCases,
                  )
                  .set({
                    status:
                      "SELLER_RESPONSE",

                    contactConfirmedByAdminUserId:
                      staff.userId,

                    contactConfirmedAt:
                      now,

                    sellerResponseDueAt:
                      dueAt,

                    updatedAt:
                      now,
                  })
                  .where(
                    and(
                      eq(
                        marketplaceRefundCases.id,
                        refundCase.id,
                      ),

                      eq(
                        marketplaceRefundCases.status,
                        "CONTACT_REQUIRED",
                      ),
                    ),
                  )
                  .returning();

              if (!updated) {
                throw new Error(
                  "REFUND_CASE_STATE_CHANGED",
                );
              }

              await tx
                .insert(
                  marketplaceRefundCaseEvents,
                )
                .values({
                  caseId:
                    refundCase.id,

                  actorUserId:
                    staff.userId,

                  actorRole:
                    staff.role,

                  eventType:
                    "CONTACT_CONFIRMED",

                  details:
                    JSON.stringify({
                      note:
                        body.data.note,

                      sellerResponseDueAt:
                        dueAt.toISOString(),

                      sellerResponseHours:
                        responseHours,
                    }).slice(
                      0,
                      1800,
                    ),
                });

              return updated;
            },
          );

        await writeAdminRefundAudit(
          staff.userId,
          "REFUND_CASE_CONTACT_CONFIRMED",
          result.id,
          {
            status:
              result.status,

            sellerResponseDueAt:
              result.sellerResponseDueAt,

            staffRole:
              staff.role,
          },
        );

        return {
          ok:
            true,

          refundCase:
            publicCase(
              result,
            ),

          source:
            "postgresql" as const,
        };
      }
      catch (error) {
        if (
          error instanceof Error &&
          error.message ===
            "REFUND_CASE_NOT_FOUND"
        ) {
          return reply
            .code(404)
            .send({
              error: {
                code:
                  "REFUND_CASE_NOT_FOUND",

                message:
                  "Refund case was not found.",
              },
            });
        }

        if (
          error instanceof Error &&
          error.message ===
            "REFUND_CASE_EVIDENCE_INCOMPLETE"
        ) {
          return reply
            .code(409)
            .send({
              error: {
                code:
                  "REFUND_CASE_EVIDENCE_INCOMPLETE",

                message:
                  "Required evidence must be present before support contact can be confirmed.",
              },
            });
        }

        if (
          error instanceof Error &&
          [
            "REFUND_CASE_CONTACT_STATE_INVALID",
            "REFUND_CASE_STATE_CHANGED",
          ].includes(
            error.message,
          )
        ) {
          return reply
            .code(409)
            .send({
              error: {
                code:
                  error.message,

                message:
                  "Refund case state does not allow contact confirmation.",
              },
            });
        }

        throw error;
      }
    },
  );

  app.post(
    "/api/v1/seller/refund-cases/:caseId/respond",
    async (
      request,
      reply,
    ) => {
      const user =
        await requireAuthUser(
          request,
        );

      const params =
        caseParams.safeParse(
          request.params,
        );

      const body =
        sellerResponseBody.safeParse(
          request.body,
        );

      if (!user) {
        return reply
          .code(401)
          .send({
            error: {
              code:
                "UNAUTHORIZED",

              message:
                "Authentication required.",
            },
          });
      }

      if (
        !params.success ||
        !body.success
      ) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "A valid refund case and seller response are required.",
            },
          });
      }

      const access =
        await caseAccess(
          user.id,
          params.data.caseId,
        );

      if (
        !access ||
        access.role !==
          "SELLER"
      ) {
        return reply
          .code(403)
          .send({
            error: {
              code:
                "REFUND_CASE_SELLER_FORBIDDEN",

              message:
                "Only an authorized member of the case store may submit the seller response.",
            },
          });
      }

      try {
        const result =
          await db.transaction(
            async tx => {
              await tx.execute(
                sql`
                  SELECT pg_advisory_xact_lock(
                    hashtextextended(
                      ${`refund-case:${params.data.caseId}`},
                      0
                    )
                  )
                `,
              );

              const [refundCase] =
                await tx
                  .select()
                  .from(
                    marketplaceRefundCases,
                  )
                  .where(
                    eq(
                      marketplaceRefundCases.id,
                      params.data.caseId,
                    ),
                  )
                  .limit(1);

              if (!refundCase) {
                throw new Error(
                  "REFUND_CASE_NOT_FOUND",
                );
              }

              const now =
                new Date();

              if (
                !canSellerRespond(
                  refundCase.status,
                  now,
                  refundCase.sellerResponseDueAt,
                )
              ) {
                throw new Error(
                  "SELLER_RESPONSE_WINDOW_CLOSED",
                );
              }

              const [updated] =
                await tx
                  .update(
                    marketplaceRefundCases,
                  )
                  .set({
                    sellerResponse:
                      body.data.response,

                    sellerRespondedByUserId:
                      user.id,

                    sellerRespondedAt:
                      now,

                    status:
                      "UNDER_REVIEW",

                    updatedAt:
                      now,
                  })
                  .where(
                    and(
                      eq(
                        marketplaceRefundCases.id,
                        refundCase.id,
                      ),

                      eq(
                        marketplaceRefundCases.status,
                        "SELLER_RESPONSE",
                      ),
                    ),
                  )
                  .returning();

              if (!updated) {
                throw new Error(
                  "REFUND_CASE_STATE_CHANGED",
                );
              }

              await tx
                .insert(
                  marketplaceRefundCaseEvents,
                )
                .values({
                  caseId:
                    refundCase.id,

                  actorUserId:
                    user.id,

                  actorRole:
                    "SELLER",

                  eventType:
                    "SELLER_RESPONSE_SUBMITTED",

                  details:
                    JSON.stringify({
                      responseLength:
                        body.data.response.length,

                      submittedAt:
                        now.toISOString(),
                    }).slice(
                      0,
                      1800,
                    ),
                });

              return updated;
            },
          );

        return {
          ok:
            true,

          refundCase:
            publicCase(
              result,
            ),

          source:
            "postgresql" as const,
        };
      }
      catch (error) {
        if (
          error instanceof Error &&
          error.message ===
            "REFUND_CASE_NOT_FOUND"
        ) {
          return reply
            .code(404)
            .send({
              error: {
                code:
                  "REFUND_CASE_NOT_FOUND",

                message:
                  "Refund case was not found.",
              },
            });
        }

        if (
          error instanceof Error &&
          [
            "SELLER_RESPONSE_WINDOW_CLOSED",
            "REFUND_CASE_STATE_CHANGED",
          ].includes(
            error.message,
          )
        ) {
          return reply
            .code(409)
            .send({
              error: {
                code:
                  error.message,

                message:
                  "The seller response window is closed or the case state changed.",
              },
            });
        }

        throw error;
      }
    },
  );

  app.post(
    "/api/v1/admin/marketplace/refund-cases/:caseId/decision",
    async (
      request,
      reply,
    ) => {
      const user =
        await requireAuthUser(
          request,
        );

      const params =
        caseParams.safeParse(
          request.params,
        );

      const body =
        adminDecisionBody.safeParse(
          request.body,
        );

      if (!user) {
        return reply
          .code(401)
          .send({
            error: {
              code:
                "UNAUTHORIZED",

              message:
                "Authentication required.",
            },
          });
      }

      if (
        !params.success ||
        !body.success
      ) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "A valid case, decision, reason and admin password are required.",
            },
          });
      }

      const admin =
        await reauthMarketplaceStaff(
          user.id,
          body.data.password,
          false,
        );

      if (!admin) {
        return reply
          .code(403)
          .send({
            error: {
              code:
                "ADMIN_REAUTH_FAILED",

              message:
                "Admin re-authentication failed or this role cannot decide refund cases.",
            },
          });
      }

      try {
        const result =
          await db.transaction(
            async tx => {
              await tx.execute(
                sql`
                  SELECT pg_advisory_xact_lock(
                    hashtextextended(
                      ${`refund-case:${params.data.caseId}`},
                      0
                    )
                  )
                `,
              );

              const [refundCase] =
                await tx
                  .select()
                  .from(
                    marketplaceRefundCases,
                  )
                  .where(
                    eq(
                      marketplaceRefundCases.id,
                      params.data.caseId,
                    ),
                  )
                  .limit(1);

              if (!refundCase) {
                throw new Error(
                  "REFUND_CASE_NOT_FOUND",
                );
              }

              if (
                refundCase.contactConfirmedAt ===
                  null
              ) {
                throw new Error(
                  "REFUND_CASE_CONTACT_NOT_CONFIRMED",
                );
              }

              const [policy] =
                await tx
                  .select()
                  .from(
                    marketplaceRefundPolicy,
                  )
                  .where(
                    eq(
                      marketplaceRefundPolicy.id,
                      "default",
                    ),
                  )
                  .limit(1);

              const evidenceRows =
                await tx
                  .select({
                    id:
                      marketplaceRefundCaseEvidence.id,
                  })
                  .from(
                    marketplaceRefundCaseEvidence,
                  )
                  .where(
                    eq(
                      marketplaceRefundCaseEvidence.caseId,
                      refundCase.id,
                    ),
                  );

              const minimumEvidence =
                Math.max(
                  policy
                    ?.minimumEvidenceCount ??
                    1,
                  1,
                );

              if (
                evidenceRows.length <
                minimumEvidence
              ) {
                throw new Error(
                  "REFUND_CASE_EVIDENCE_INCOMPLETE",
                );
              }

              const now =
                new Date();

              if (
                !canAdminDecide(
                  refundCase.status,
                  now,
                  refundCase.sellerResponseDueAt,
                )
              ) {
                throw new Error(
                  "REFUND_CASE_DECISION_NOT_READY",
                );
              }

              let financialPlan:
                ReturnType<
                  typeof buildSellerOrderRefundPlan
                > |
                null =
                  null;

              if (
                body.data.action ===
                  "APPROVE"
              ) {
                const [sellerOrder] =
                  await tx
                    .select()
                    .from(
                      marketplaceSellerOrders,
                    )
                    .where(
                      and(
                        eq(
                          marketplaceSellerOrders.id,
                          refundCase.sellerOrderId,
                        ),

                        eq(
                          marketplaceSellerOrders.orderId,
                          refundCase.orderId,
                        ),

                        eq(
                          marketplaceSellerOrders.storeId,
                          refundCase.storeId,
                        ),
                      ),
                    )
                    .limit(1);

                if (!sellerOrder) {
                  throw new Error(
                    "REFUND_CASE_SELLER_ORDER_MISSING",
                  );
                }

                financialPlan =
                  buildSellerOrderRefundPlan({
                    grossRial:
                      sellerOrder.grossRial,

                    platformCommissionRial:
                      sellerOrder.platformCommissionRial,

                    sellerNetRial:
                      sellerOrder.sellerNetRial,
                  });
              }

              const nextStatus =
                adminDecisionStatus(
                  body.data.action,
                  body.data.returnRequired,
                );

              const returnRequired =
                body.data.action ===
                  "APPROVE"
                  ? body.data.returnRequired
                  : false;

              const [updated] =
                await tx
                  .update(
                    marketplaceRefundCases,
                  )
                  .set({
                    status:
                      nextStatus,

                    decidedByAdminUserId:
                      admin.userId,

                    decisionReason:
                      body.data.reason,

                    returnRequired,

                    decidedAt:
                      now,

                    refundAmountRial:
                      financialPlan
                        ?.refundAmountRial ??
                      null,

                    commissionReversalRial:
                      financialPlan
                        ?.commissionReversalRial ??
                      null,

                    sellerNetReversalRial:
                      financialPlan
                        ?.sellerNetReversalRial ??
                      null,

                    financialPlanCreatedAt:
                      financialPlan
                        ? now
                        : null,

                    updatedAt:
                      now,
                  })
                  .where(
                    eq(
                      marketplaceRefundCases.id,
                      refundCase.id,
                    ),
                  )
                  .returning();

              if (!updated) {
                throw new Error(
                  "REFUND_CASE_STATE_CHANGED",
                );
              }

              await tx
                .insert(
                  marketplaceRefundCaseEvents,
                )
                .values({
                  caseId:
                    refundCase.id,

                  actorUserId:
                    admin.userId,

                  actorRole:
                    admin.role,

                  eventType:
                    body.data.action ===
                      "APPROVE"
                      ? "ADMIN_APPROVED"
                      : "ADMIN_REJECTED",

                  details:
                    JSON.stringify({
                      reason:
                        body.data.reason,

                      returnRequired,

                      nextStatus,

                      refundPlan:
                        financialPlan
                          ? {
                              refundAmountRial:
                                financialPlan.refundAmountRial,

                              commissionReversalRial:
                                financialPlan.commissionReversalRial,

                              sellerNetReversalRial:
                                financialPlan.sellerNetReversalRial,
                            }
                          : null,
                    }).slice(
                      0,
                      1800,
                    ),
                });

              return updated;
            },
          );

        await writeAdminRefundAudit(
          admin.userId,
          body.data.action ===
            "APPROVE"
            ? "REFUND_CASE_APPROVED"
            : "REFUND_CASE_REJECTED",
          result.id,
          {
            status:
              result.status,

            returnRequired:
              result.returnRequired,

            financialRefundExecuted:
              false,
          },
        );

        return {
          ok:
            true,

          refundCase:
            publicCase(
              result,
            ),

          financialRefundExecuted:
            false,

          source:
            "postgresql" as const,
        };
      }
      catch (error) {
        if (
          error instanceof Error &&
          error.message ===
            "REFUND_CASE_NOT_FOUND"
        ) {
          return reply
            .code(404)
            .send({
              error: {
                code:
                  "REFUND_CASE_NOT_FOUND",

                message:
                  "Refund case was not found.",
              },
            });
        }

        if (
          error instanceof Error &&
          [
            "REFUND_CASE_CONTACT_NOT_CONFIRMED",
            "REFUND_CASE_EVIDENCE_INCOMPLETE",
            "REFUND_CASE_DECISION_NOT_READY",
            "REFUND_CASE_STATE_CHANGED",
            "REFUND_CASE_SELLER_ORDER_MISSING",
            "INVALID_REFUND_PLAN_GROSS",
            "INVALID_REFUND_PLAN_COMMISSION",
            "INVALID_REFUND_PLAN_SELLER_NET",
            "INVALID_REFUND_PLAN_ZERO_GROSS",
            "INVALID_REFUND_PLAN_UNBALANCED",
          ].includes(
            error.message,
          )
        ) {
          return reply
            .code(409)
            .send({
              error: {
                code:
                  error.message,

                message:
                  "Refund case is not ready for an admin decision.",
              },
            });
        }

        throw error;
      }
    },
  );


  app.post(
    "/api/v1/admin/marketplace/refund-cases/:caseId/confirm-return",
    async (
      request,
      reply,
    ) => {
      const user =
        await requireAuthUser(
          request,
        );

      const params =
        caseParams.safeParse(
          request.params,
        );

      const body =
        returnConfirmationBody.safeParse(
          request.body,
        );

      if (!user) {
        return reply
          .code(401)
          .send({
            error: {
              code:
                "UNAUTHORIZED",

              message:
                "Authentication required.",
            },
          });
      }

      if (
        !params.success ||
        !body.success
      ) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "A valid refund case, password and return note are required.",
            },
          });
      }

      const admin =
        await reauthMarketplaceStaff(
          user.id,
          body.data.password,
          false,
        );

      if (!admin) {
        return reply
          .code(403)
          .send({
            error: {
              code:
                "ADMIN_REAUTH_FAILED",

              message:
                "Admin re-authentication failed or this role cannot confirm a return.",
            },
          });
      }

      try {
        const result =
          await db.transaction(
            async tx => {
              await tx.execute(
                sql`
                  SELECT pg_advisory_xact_lock(
                    hashtextextended(
                      ${`refund-case:${params.data.caseId}`},
                      0
                    )
                  )
                `,
              );

              const [refundCase] =
                await tx
                  .select()
                  .from(
                    marketplaceRefundCases,
                  )
                  .where(
                    eq(
                      marketplaceRefundCases.id,
                      params.data.caseId,
                    ),
                  )
                  .limit(1);

              if (!refundCase) {
                throw new Error(
                  "REFUND_CASE_NOT_FOUND",
                );
              }

              if (
                refundCase.status !==
                  "RETURN_REQUIRED"
              ) {
                throw new Error(
                  "REFUND_CASE_RETURN_NOT_REQUIRED",
                );
              }

              if (
                !hasCompleteRefundPlan({
                  refundAmountRial:
                    refundCase.refundAmountRial,

                  commissionReversalRial:
                    refundCase.commissionReversalRial,

                  sellerNetReversalRial:
                    refundCase.sellerNetReversalRial,

                  financialPlanCreatedAt:
                    refundCase.financialPlanCreatedAt,
                })
              ) {
                throw new Error(
                  "REFUND_CASE_FINANCIAL_PLAN_MISSING",
                );
              }

              const now =
                new Date();

              const [updated] =
                await tx
                  .update(
                    marketplaceRefundCases,
                  )
                  .set({
                    status:
                      "APPROVED",

                    returnReceivedAt:
                      now,

                    returnReceivedByAdminUserId:
                      admin.userId,

                    returnNote:
                      body.data.note,

                    updatedAt:
                      now,
                  })
                  .where(
                    and(
                      eq(
                        marketplaceRefundCases.id,
                        refundCase.id,
                      ),

                      eq(
                        marketplaceRefundCases.status,
                        "RETURN_REQUIRED",
                      ),
                    ),
                  )
                  .returning();

              if (!updated) {
                throw new Error(
                  "REFUND_CASE_STATE_CHANGED",
                );
              }

              await tx
                .insert(
                  marketplaceRefundCaseEvents,
                )
                .values({
                  caseId:
                    refundCase.id,

                  actorUserId:
                    admin.userId,

                  actorRole:
                    admin.role,

                  eventType:
                    "RETURN_RECEIVED_CONFIRMED",

                  details:
                    JSON.stringify({
                      note:
                        body.data.note,

                      nextStatus:
                        "APPROVED",

                      refundAmountRial:
                        updated.refundAmountRial,
                    }).slice(
                      0,
                      1800,
                    ),
                });

              return updated;
            },
          );

        await writeAdminRefundAudit(
          admin.userId,
          "REFUND_CASE_RETURN_CONFIRMED",
          result.id,
          {
            status:
              result.status,

            returnReceivedAt:
              result.returnReceivedAt,

            refundAmountRial:
              result.refundAmountRial,

            financialRefundExecuted:
              false,
          },
        );

        return {
          ok:
            true,

          refundCase:
            publicCase(
              result,
            ),

          financialRefundExecuted:
            false,

          source:
            "postgresql" as const,
        };
      }
      catch (error) {
        if (
          error instanceof Error &&
          error.message ===
            "REFUND_CASE_NOT_FOUND"
        ) {
          return reply
            .code(404)
            .send({
              error: {
                code:
                  "REFUND_CASE_NOT_FOUND",

                message:
                  "Refund case was not found.",
              },
            });
        }

        if (
          error instanceof Error &&
          [
            "REFUND_CASE_RETURN_NOT_REQUIRED",
            "REFUND_CASE_FINANCIAL_PLAN_MISSING",
            "REFUND_CASE_STATE_CHANGED",
          ].includes(
            error.message,
          )
        ) {
          return reply
            .code(409)
            .send({
              error: {
                code:
                  error.message,

                message:
                  "Refund case is not ready for return confirmation.",
              },
            });
        }

        throw error;
      }
    },
  );

  // DND_NERDS_J2N_D2_SELLER_SCOPED_REFUND_EXECUTE_MOCK_ONLY
  app.post("/api/v1/admin/marketplace/refund-cases/:caseId/execute-financial-refund", async (request, reply) => {
    const user = await requireAuthUser(request);
    if (!user) return reply.code(401).send({ error: { code: "UNAUTHORIZED", message: "Authentication required." } });
    const params = caseParams.safeParse(request.params);
    const body = z.object({ password: z.string().min(8).max(128) }).safeParse(request.body);
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: { code: "VALIDATION_ERROR", message: "Valid case ID and password required." } });
    }
    const admin = await reauthMarketplaceStaff(user.id, body.data.password, false);
    if (!admin) return reply.code(403).send({ error: { code: "ADMIN_REAUTH_FAILED", message: "Admin re-auth failed or insufficient role." } });
    try {
      const result = await executeSellerOrderRefundCase(params.data.caseId, admin.userId);
      return { ok: true, refundId: result.refund?.id ?? null, status: result.refund?.status ?? null, idempotent: result.idempotent };
    } catch (error) {
      if (error instanceof PaymentDomainError) {
        return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message, details: error.details ?? null } });
      }
      throw error;
    }
  });

}
