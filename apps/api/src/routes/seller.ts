
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import {
  and,
  desc,
  eq,
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
  releaseDeliveredFunds,
} from "../finance/seller-balance-policy.js";

import {
  inventory,
  marketplaceConfig,
  marketplaceSellerOrders,
  marketplaceShipments,
  productVariants,
  products,
  sellerBalances,
  sellerProfiles,
  storeCommissionSettings,
  storeMembers,
  stores,
} from "../db/schema.js";

const onboardBody =
  z.object({
    displayName: z.string().trim().min(2).max(120),
    storeName: z.string().trim().min(2).max(140),
    storeSlug:
      z.string()
        .trim()
        .toLowerCase()
        .min(3)
        .max(80)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: z.string().trim().min(10).max(800),
    category: z.string().trim().min(2).max(120),
  });

const storeParams =
  z.object({
    storeId: z.string().uuid(),
  });

const productParams =
  z.object({
    storeId: z.string().uuid(),
    productId: z.string().uuid(),
  });

const sellerOrderParams =
  z.object({
    storeId: z.string().uuid(),
    sellerOrderId: z.string().uuid(),
  });

const createProductBody =
  z.object({
    slug:
      z.string()
        .trim()
        .toLowerCase()
        .min(3)
        .max(100)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().trim().min(2).max(180),
    description: z.string().trim().min(5).max(1200),
    category: z.string().trim().min(2).max(120),
    sku: z.string().trim().min(2).max(100),
    priceRial: z.number().int().min(1000).max(2_000_000_000),
    stock: z.number().int().min(0).max(1_000_000),
    publish: z.boolean().default(false),
  });

const updateProductBody =
  z.object({
    priceRial: z.number().int().min(1000).max(2_000_000_000).optional(),
    stock: z.number().int().min(0).max(1_000_000).optional(),
    status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  })
    .refine(
      (value) => Object.keys(value).length > 0,
      { message: "At least one field is required." },
    );

const fulfillmentBody =
  z.discriminatedUnion("action", [
    z.object({
      action: z.literal("PROCESSING"),
    }),
    z.object({
      action: z.literal("SHIP"),
      carrier: z.string().trim().min(2).max(120),
      trackingCode: z.string().trim().min(3).max(160),
    }),
    z.object({
      action: z.literal("DELIVER"),
    }),
  ]);

function rialToToman(value: number) {
  return Math.trunc(value / 10);
}

async function requireStoreAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  storeId: string,
  allowedRoles: readonly string[],
) {
  const user =
    await requireAuthUser(request);

  if (!user) {
    reply.code(401).send({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required.",
      },
    });
    return null;
  }

  const [row] =
    await db
      .select({
        storeId: stores.id,
        storeStatus: stores.status,
        role: storeMembers.role,
      })
      .from(storeMembers)
      .innerJoin(
        stores,
        eq(stores.id, storeMembers.storeId),
      )
      .where(
        and(
          eq(storeMembers.userId, user.id),
          eq(storeMembers.storeId, storeId),
        ),
      )
      .limit(1);

  if (
    !row ||
    !allowedRoles.includes(row.role)
  ) {
    reply.code(403).send({
      error: {
        code: "SELLER_FORBIDDEN",
        message: "You do not have permission for this store.",
      },
    });
    return null;
  }

  return {
    user,
    membership: row,
  };
}

export async function registerSellerRoutes(
  app: FastifyInstance,
) {
  app.post(
    "/api/v1/seller/onboard",
    async (request, reply) => {
      const user =
        await requireAuthUser(request);

      if (!user) {
        return reply.code(401).send({
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required.",
          },
        });
      }

      const parsed =
        onboardBody.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid seller onboarding request.",
          },
        });
      }

      const [existingSeller] =
        await db
          .select({ id: sellerProfiles.id })
          .from(sellerProfiles)
          .where(eq(sellerProfiles.userId, user.id))
          .limit(1);

      if (existingSeller) {
        return reply.code(409).send({
          error: {
            code: "SELLER_ALREADY_EXISTS",
            message: "This account already has a seller profile.",
          },
        });
      }

      const [existingSlug] =
        await db
          .select({ id: stores.id })
          .from(stores)
          .where(eq(stores.slug, parsed.data.storeSlug))
          .limit(1);

      if (existingSlug) {
        return reply.code(409).send({
          error: {
            code: "STORE_SLUG_EXISTS",
            message: "This store slug is already in use.",
          },
        });
      }

      const created =
        await db.transaction(async (tx) => {
          const [seller] =
            await tx
              .insert(sellerProfiles)
              .values({
                userId: user.id,
                displayName: parsed.data.displayName,
                status: "PENDING_REVIEW",
              })
              .returning();

          if (!seller) {
            throw new Error("Seller profile creation failed.");
          }

          const [store] =
            await tx
              .insert(stores)
              .values({
                sellerProfileId: seller.id,
                slug: parsed.data.storeSlug,
                name: parsed.data.storeName,
                description: parsed.data.description,
                category: parsed.data.category,
                status: "PENDING_REVIEW",
                verified: false,
              })
              .returning();

          if (!store) {
            throw new Error("Store creation failed.");
          }

          await tx
            .insert(storeMembers)
            .values({
              storeId: store.id,
              userId: user.id,
              role: "OWNER",
            });

          return { seller, store };
        });

      return reply.code(201).send({
        seller: {
          id: created.seller.id,
          displayName: created.seller.displayName,
          status: created.seller.status,
        },
        store: {
          id: created.store.id,
          slug: created.store.slug,
          name: created.store.name,
          status: created.store.status,
        },
        source: "postgresql",
      });
    },
  );

  app.get(
    "/api/v1/seller/dashboard",
    async (request, reply) => {
      const user =
        await requireAuthUser(request);

      if (!user) {
        return reply.code(401).send({
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required.",
          },
        });
      }

      const [seller] =
        await db
          .select()
          .from(sellerProfiles)
          .where(eq(sellerProfiles.userId, user.id))
          .limit(1);

      if (!seller) {
        return {
          seller: null,
          stores: [],
          source: "postgresql" as const,
        };
      }

      const memberships =
        await db
          .select({
            storeId: stores.id,
            slug: stores.slug,
            name: stores.name,
            status: stores.status,
            verified: stores.verified,
            role: storeMembers.role,
          })
          .from(storeMembers)
          .innerJoin(stores, eq(stores.id, storeMembers.storeId))
          .where(eq(storeMembers.userId, user.id));

      const [config] =
        await db
          .select()
          .from(marketplaceConfig)
          .where(eq(marketplaceConfig.id, "global"))
          .limit(1);

      const result = [];

      for (const store of memberships) {
        const productRows =
          await db
            .select({
              id: products.id,
              slug: products.slug,
              name: products.name,
              status: products.status,
              priceRial: productVariants.priceRial,
              quantityOnHand: inventory.quantityOnHand,
              quantityReserved: inventory.quantityReserved,
            })
            .from(products)
            .innerJoin(
              productVariants,
              and(
                eq(productVariants.productId, products.id),
                eq(productVariants.isDefault, true),
              ),
            )
            .innerJoin(
              inventory,
              eq(inventory.variantId, productVariants.id),
            )
            .where(eq(products.storeId, store.storeId))
            .orderBy(desc(products.createdAt));

        const orderRows =
          await db
            .select({
              id: marketplaceSellerOrders.id,
              status: marketplaceSellerOrders.status,
              grossRial: marketplaceSellerOrders.grossRial,
              sellerNetRial: marketplaceSellerOrders.sellerNetRial,
            })
            .from(marketplaceSellerOrders)
            .where(eq(marketplaceSellerOrders.storeId, store.storeId))
            .orderBy(desc(marketplaceSellerOrders.createdAt));

        const [balance] =
          await db
            .select()
            .from(sellerBalances)
            .where(eq(sellerBalances.storeId, store.storeId))
            .limit(1);

        const [override] =
          await db
            .select()
            .from(storeCommissionSettings)
            .where(
              and(
                eq(storeCommissionSettings.storeId, store.storeId),
                eq(storeCommissionSettings.active, true),
              ),
            )
            .limit(1);

        result.push({
          ...store,
          commissionBps:
            override?.commissionBps ??
            config?.defaultCommissionBps ??
            500,
          balance: {
            pendingToman: rialToToman(balance?.pendingRial ?? 0),
            availableToman: rialToToman(balance?.availableRial ?? 0),
            negativeToman: rialToToman(balance?.negativeRial ?? 0),
            paidOutToman: rialToToman(balance?.paidOutRial ?? 0),
          },
          products:
            productRows.map((product) => ({
              ...product,
              priceToman: rialToToman(product.priceRial),
              available:
                product.quantityOnHand -
                product.quantityReserved,
            })),
          orders:
            orderRows.map((order) => ({
              ...order,
              grossToman: rialToToman(order.grossRial),
              sellerNetToman: rialToToman(order.sellerNetRial),
            })),
        });
      }

      return {
        seller: {
          id: seller.id,
          displayName: seller.displayName,
          status: seller.status,
        },
        stores: result,
        source: "postgresql" as const,
      };
    },
  );

  app.post(
    "/api/v1/seller/stores/:storeId/products",
    async (request, reply) => {
      const params = storeParams.safeParse(request.params);
      const body = createProductBody.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid product request.",
          },
        });
      }

      const access =
        await requireStoreAccess(
          request,
          reply,
          params.data.storeId,
          ["OWNER", "MANAGER", "PRODUCT_EDITOR"],
        );

      if (!access) {
        return;
      }

      if (
        body.data.publish &&
        access.membership.storeStatus !== "ACTIVE"
      ) {
        return reply.code(409).send({
          error: {
            code: "STORE_NOT_ACTIVE",
            message: "Store must be active before publishing products.",
          },
        });
      }

      const [duplicate] =
        await db
          .select({ id: products.id })
          .from(products)
          .where(
            and(
              eq(products.storeId, params.data.storeId),
              eq(products.slug, body.data.slug),
            ),
          )
          .limit(1);

      if (duplicate) {
        return reply.code(409).send({
          error: {
            code: "PRODUCT_SLUG_EXISTS",
            message: "Product slug already exists.",
          },
        });
      }

      const created =
        await db.transaction(async (tx) => {
          const [product] =
            await tx
              .insert(products)
              .values({
                storeId: params.data.storeId,
                slug: body.data.slug,
                name: body.data.name,
                description: body.data.description,
                category: body.data.category,
                status: body.data.publish ? "PUBLISHED" : "DRAFT",
              })
              .returning();

          if (!product) {
            throw new Error("Product creation failed.");
          }

          const [variant] =
            await tx
              .insert(productVariants)
              .values({
                productId: product.id,
                sku: body.data.sku,
                name: "Default",
                priceRial: body.data.priceRial,
                isDefault: true,
                status: "ACTIVE",
              })
              .returning();

          if (!variant) {
            throw new Error("Variant creation failed.");
          }

          await tx
            .insert(inventory)
            .values({
              variantId: variant.id,
              quantityOnHand: body.data.stock,
              quantityReserved: 0,
            });

          return { product, variant };
        });

      return reply.code(201).send({
        product: {
          id: created.product.id,
          slug: created.product.slug,
          name: created.product.name,
          status: created.product.status,
          priceRial: created.variant.priceRial,
          stock: body.data.stock,
        },
        source: "postgresql",
      });
    },
  );

  app.patch(
    "/api/v1/seller/stores/:storeId/products/:productId",
    async (request, reply) => {
      const params = productParams.safeParse(request.params);
      const body = updateProductBody.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid product update.",
          },
        });
      }

      const access =
        await requireStoreAccess(
          request,
          reply,
          params.data.storeId,
          ["OWNER", "MANAGER", "PRODUCT_EDITOR"],
        );

      if (!access) {
        return;
      }

      if (
        body.data.status === "PUBLISHED" &&
        access.membership.storeStatus !== "ACTIVE"
      ) {
        return reply.code(409).send({
          error: {
            code: "STORE_NOT_ACTIVE",
            message: "Store must be active before publishing products.",
          },
        });
      }

      const [product] =
        await db
          .select()
          .from(products)
          .where(
            and(
              eq(products.id, params.data.productId),
              eq(products.storeId, params.data.storeId),
            ),
          )
          .limit(1);

      if (!product) {
        return reply.code(404).send({
          error: {
            code: "PRODUCT_NOT_FOUND",
            message: "Product was not found.",
          },
        });
      }

      const [variant] =
        await db
          .select()
          .from(productVariants)
          .where(
            and(
              eq(productVariants.productId, product.id),
              eq(productVariants.isDefault, true),
            ),
          )
          .limit(1);

      if (!variant) {
        throw new Error("Default variant is missing.");
      }

      if (body.data.stock !== undefined) {
        const changed =
          await db
            .update(inventory)
            .set({
              quantityOnHand: body.data.stock,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(inventory.variantId, variant.id),
                sql`${inventory.quantityReserved} <= ${body.data.stock}`,
              ),
            )
            .returning({ id: inventory.id });

        if (changed.length !== 1) {
          return reply.code(409).send({
            error: {
              code: "STOCK_BELOW_RESERVED",
              message: "Stock cannot be lower than reserved quantity.",
            },
          });
        }
      }

      if (body.data.priceRial !== undefined) {
        await db
          .update(productVariants)
          .set({
            priceRial: body.data.priceRial,
            updatedAt: new Date(),
          })
          .where(eq(productVariants.id, variant.id));
      }

      if (body.data.status !== undefined) {
        await db
          .update(products)
          .set({
            status: body.data.status,
            updatedAt: new Date(),
          })
          .where(eq(products.id, product.id));
      }

      return {
        ok: true,
        productId: product.id,
        source: "postgresql" as const,
      };
    },
  );

  app.post(
    "/api/v1/seller/stores/:storeId/orders/:sellerOrderId/fulfillment",
    async (request, reply) => {
      const params = sellerOrderParams.safeParse(request.params);
      const body = fulfillmentBody.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid fulfillment request.",
          },
        });
      }

      const access = await requireStoreAccess(
        request,
        reply,
        params.data.storeId,
        ["OWNER", "MANAGER", "ORDER_MANAGER"],
      );

      if (!access) {
        return;
      }

      // All order transitions and balance releases MUST serialize with
      // refund/payout/payment postings for the same store. The order state
      // must be read *after* the shared store-balance advisory lock is held.
      // This prevents concurrent DELIVER requests from releasing funds twice.
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`
            SELECT pg_advisory_xact_lock(
              hashtextextended(${`seller-balance:${params.data.storeId}`}, 0)
            )
          `,
        );

        const [order] = await tx
          .select()
          .from(marketplaceSellerOrders)
          .where(
            and(
              eq(marketplaceSellerOrders.id, params.data.sellerOrderId),
              eq(marketplaceSellerOrders.storeId, params.data.storeId),
            ),
          )
          .limit(1);

        if (!order) {
          return reply.code(404).send({
            error: {
              code: "SELLER_ORDER_NOT_FOUND",
              message: "Seller order was not found.",
            },
          });
        }

        const now = new Date();

        if (body.data.action === "PROCESSING") {
          if (order.status !== "PAID") {
            return reply.code(409).send({
              error: {
                code: "INVALID_FULFILLMENT_TRANSITION",
                message: "Only PAID orders can move to PROCESSING.",
              },
            });
          }

          await tx.update(marketplaceSellerOrders).set({
            status: "PROCESSING",
            updatedAt: now,
          }).where(eq(marketplaceSellerOrders.id, order.id));

          return { ok: true, status: "PROCESSING" };
        }

        if (body.data.action === "SHIP") {
          if (order.status !== "PAID" && order.status !== "PROCESSING") {
            return reply.code(409).send({
              error: {
                code: "INVALID_FULFILLMENT_TRANSITION",
                message: "Order cannot be shipped from its current state.",
              },
            });
          }

          const [shipment] = await tx
            .select()
            .from(marketplaceShipments)
            .where(eq(marketplaceShipments.sellerOrderId, order.id))
            .limit(1);

          if (shipment) {
            await tx.update(marketplaceShipments).set({
              carrier: body.data.carrier,
              trackingCode: body.data.trackingCode,
              status: "SHIPPED",
              shippedAt: shipment.shippedAt ?? now,
              updatedAt: now,
            }).where(eq(marketplaceShipments.id, shipment.id));
          } else {
            await tx.insert(marketplaceShipments).values({
              sellerOrderId: order.id,
              storeId: params.data.storeId,
              carrier: body.data.carrier,
              trackingCode: body.data.trackingCode,
              status: "SHIPPED",
              shippedAt: now,
              updatedAt: now,
            });
          }

          await tx.update(marketplaceSellerOrders).set({
            status: "SHIPPED",
            updatedAt: now,
          }).where(eq(marketplaceSellerOrders.id, order.id));

          return { ok: true, status: "SHIPPED" };
        }

        if (order.status !== "SHIPPED") {
          return reply.code(409).send({
            error: {
              code: "INVALID_FULFILLMENT_TRANSITION",
              message: "Only SHIPPED orders can be marked DELIVERED.",
            },
          });
        }

        const [balance] = await tx.select().from(sellerBalances)
          .where(eq(sellerBalances.storeId, order.storeId))
          .limit(1);

        if (!balance) {
          throw new Error("SELLER_BALANCE_RELEASE_FAILED");
        }

        const nextBalance = releaseDeliveredFunds(balance, order.sellerNetRial);

        const releasedBalance = await tx.update(sellerBalances).set({
          pendingRial: nextBalance.pendingRial,
          availableRial: nextBalance.availableRial,
          negativeRial: nextBalance.negativeRial,
          updatedAt: now,
        }).where(eq(sellerBalances.storeId, order.storeId))
          .returning({ storeId: sellerBalances.storeId });

        if (releasedBalance.length !== 1) {
          throw new Error("SELLER_BALANCE_RELEASE_FAILED");
        }

        await tx.update(marketplaceShipments).set({
          status: "DELIVERED",
          deliveredAt: now,
          updatedAt: now,
        }).where(eq(marketplaceShipments.sellerOrderId, order.id));

        await tx.update(marketplaceSellerOrders).set({
          status: "DELIVERED",
          updatedAt: now,
        }).where(eq(marketplaceSellerOrders.id, order.id));

        return { ok: true, status: "DELIVERED" };
      });
    },
  );
}
