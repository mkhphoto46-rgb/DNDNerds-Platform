import type {
  FastifyInstance,
} from "fastify";

import {
  and,
  count,
  eq,
} from "drizzle-orm";

import {
  z,
} from "zod";

import {
  db,
} from "../db/client";

import {
  inventory,
  marketplaceConfig,
  productVariants,
  products,
  storeCommissionSettings,
  stores,
} from "../db/schema";

import {
  bpsToPercent,
  calculateCommission,
} from "../lib/money";

const checkoutPreviewSchema =
  z.object({
    items:
      z
        .array(
          z.object({
            productId:
              z.string().uuid(),

            quantity:
              z
                .number()
                .int()
                .min(1)
                .max(99),
          }),
        )
        .min(1)
        .max(100),
  });

async function getGlobalConfig() {
  const [row] =
    await db
      .select()
      .from(
        marketplaceConfig,
      )
      .where(
        eq(
          marketplaceConfig.id,
          "global",
        ),
      )
      .limit(1);

  if (!row) {
    throw new Error(
      "Marketplace configuration is missing",
    );
  }

  return row;
}

async function getCommissionBps(
  storeId: string,
  defaultBps: number,
) {
  const [override] =
    await db
      .select()
      .from(
        storeCommissionSettings,
      )
      .where(
        and(
          eq(
            storeCommissionSettings.storeId,
            storeId,
          ),
          eq(
            storeCommissionSettings.active,
            true,
          ),
        ),
      )
      .limit(1);

  return (
    override?.commissionBps ??
    defaultBps
  );
}

async function getDefaultVariant(
  productId: string,
) {
  const [row] =
    await db
      .select({
        variantId:
          productVariants.id,

        priceRial:
          productVariants.priceRial,

        quantityOnHand:
          inventory.quantityOnHand,

        quantityReserved:
          inventory.quantityReserved,
      })
      .from(
        productVariants,
      )
      .leftJoin(
        inventory,
        eq(
          inventory.variantId,
          productVariants.id,
        ),
      )
      .where(
        and(
          eq(
            productVariants.productId,
            productId,
          ),

          eq(
            productVariants.isDefault,
            true,
          ),

          eq(
            productVariants.status,
            "ACTIVE",
          ),
        ),
      )
      .limit(1);

  return row ?? null;
}

function availableInventory(
  onHand:
    number | null,

  reserved:
    number | null,
) {
  return Math.max(
    0,
    (onHand ?? 0) -
      (reserved ?? 0),
  );
}

function rialToToman(
  rial: number,
) {
  return Math.trunc(
    rial / 10,
  );
}

export async function registerMarketplaceRoutes(
  app:
    FastifyInstance,
) {
  app.get(
    "/api/v1/marketplace/config",

    async () => {
      const config =
        await getGlobalConfig();

      return {
        marketplace:
          "DND Nerds Marketplace",

        multiVendor:
          true,

        multiVendorCart:
          config.multiVendorCart,

        sellerFulfillment:
          config.sellerFulfillment,

        platformOwnInventory:
          config.platformOwnInventory,

        defaultCommissionBps:
          config.defaultCommissionBps,

        defaultCommissionPercent:
          bpsToPercent(
            config.defaultCommissionBps,
          ),

        commissionLabel:
          "Platform Commission",

        source:
          "postgresql",
      };
    },
  );

  app.get(
    "/api/v1/marketplace/stats",

    async () => {
      const [storeCount] =
        await db
          .select({
            value:
              count(),
          })
          .from(
            stores,
          )
          .where(
            eq(
              stores.status,
              "ACTIVE",
            ),
          );

      const [productCount] =
        await db
          .select({
            value:
              count(),
          })
          .from(
            products,
          )
          .where(
            eq(
              products.status,
              "PUBLISHED",
            ),
          );

      const [verifiedCount] =
        await db
          .select({
            value:
              count(),
          })
          .from(
            stores,
          )
          .where(
            and(
              eq(
                stores.status,
                "ACTIVE",
              ),

              eq(
                stores.verified,
                true,
              ),
            ),
          );

      return {
        stores:
          Number(
            storeCount?.value ??
            0,
          ),

        products:
          Number(
            productCount?.value ??
            0,
          ),

        verifiedStores:
          Number(
            verifiedCount?.value ??
            0,
          ),

        source:
          "postgresql",
      };
    },
  );

  app.get(
    "/api/v1/stores",

    async () => {
      const config =
        await getGlobalConfig();

      const rows =
        await db
          .select()
          .from(
            stores,
          )
          .where(
            eq(
              stores.status,
              "ACTIVE",
            ),
          )
          .orderBy(
            stores.name,
          );

      const data = [];

      for (
        const store
        of rows
      ) {
        const [productCount] =
          await db
            .select({
              value:
                count(),
            })
            .from(
              products,
            )
            .where(
              and(
                eq(
                  products.storeId,
                  store.id,
                ),

                eq(
                  products.status,
                  "PUBLISHED",
                ),
              ),
            );

        const commissionBps =
          await getCommissionBps(
            store.id,
            config.defaultCommissionBps,
          );

        data.push({
          id:
            store.id,

          slug:
            store.slug,

          name:
            store.name,

          description:
            store.description,

          category:
            store.category,

          rating:
            store.ratingHundredths /
            100,

          reviewCount:
            store.reviewCount,

          verified:
            store.verified,

          fulfillmentMode:
            store.fulfillmentMode,

          productCount:
            Number(
              productCount?.value ??
              0,
            ),

          commissionBps,

          commissionPercent:
            bpsToPercent(
              commissionBps,
            ),
        });
      }

      return {
        data,
        source:
          "postgresql",
      };
    },
  );

  app.get(
    "/api/v1/stores/:storeSlug",

    async (
      request,
      reply,
    ) => {
      const {
        storeSlug,
      } =
        request.params as {
          storeSlug:
            string;
        };

      const [store] =
        await db
          .select()
          .from(
            stores,
          )
          .where(
            and(
              eq(
                stores.slug,
                storeSlug,
              ),

              eq(
                stores.status,
                "ACTIVE",
              ),
            ),
          )
          .limit(1);

      if (!store) {
        return reply
          .code(404)
          .send({
            error: {
              code:
                "STORE_NOT_FOUND",

              message:
                "Store not found",
            },
          });
      }

      const config =
        await getGlobalConfig();

      const commissionBps =
        await getCommissionBps(
          store.id,
          config.defaultCommissionBps,
        );

      const productRows =
        await db
          .select()
          .from(
            products,
          )
          .where(
            and(
              eq(
                products.storeId,
                store.id,
              ),

              eq(
                products.status,
                "PUBLISHED",
              ),
            ),
          );

      const hydrated = [];

      for (
        const product
        of productRows
      ) {
        const variant =
          await getDefaultVariant(
            product.id,
          );

        if (!variant) {
          continue;
        }

        hydrated.push({
          id:
            product.id,

          slug:
            product.slug,

          name:
            product.name,

          description:
            product.description,

          category:
            product.category,

          priceRial:
            variant.priceRial,

          priceToman:
            rialToToman(
              variant.priceRial,
            ),

          inventory:
            availableInventory(
              variant.quantityOnHand,
              variant.quantityReserved,
            ),
        });
      }

      return {
        id:
          store.id,

        slug:
          store.slug,

        name:
          store.name,

        description:
          store.description,

        category:
          store.category,

        rating:
          store.ratingHundredths /
          100,

        reviewCount:
          store.reviewCount,

        verified:
          store.verified,

        fulfillmentMode:
          store.fulfillmentMode,

        commissionBps,

        commissionPercent:
          bpsToPercent(
            commissionBps,
          ),

        products:
          hydrated,

        source:
          "postgresql",
      };
    },
  );

  app.get(
    "/api/v1/products",

    async () => {
      const rows =
        await db
          .select()
          .from(
            products,
          )
          .where(
            eq(
              products.status,
              "PUBLISHED",
            ),
          )
          .orderBy(
            products.name,
          );

      const data = [];

      for (
        const product
        of rows
      ) {
        const [store] =
          await db
            .select()
            .from(
              stores,
            )
            .where(
              eq(
                stores.id,
                product.storeId,
              ),
            )
            .limit(1);

        const variant =
          await getDefaultVariant(
            product.id,
          );

        if (
          !store ||
          !variant
        ) {
          continue;
        }

        data.push({
          id:
            product.id,

          storeId:
            store.id,

          slug:
            product.slug,

          name:
            product.name,

          description:
            product.description,

          category:
            product.category,

          priceRial:
            variant.priceRial,

          priceToman:
            rialToToman(
              variant.priceRial,
            ),

          inventory:
            availableInventory(
              variant.quantityOnHand,
              variant.quantityReserved,
            ),

          store: {
            id:
              store.id,

            slug:
              store.slug,

            name:
              store.name,

            verified:
              store.verified,
          },
        });
      }

      return {
        data,

        pagination: {
          returned:
            data.length,
        },

        source:
          "postgresql",
      };
    },
  );

  app.get(
    "/api/v1/stores/:storeSlug/products/:productSlug",

    async (
      request,
      reply,
    ) => {
      const {
        storeSlug,
        productSlug,
      } =
        request.params as {
          storeSlug:
            string;

          productSlug:
            string;
        };

      const [store] =
        await db
          .select()
          .from(
            stores,
          )
          .where(
            and(
              eq(
                stores.slug,
                storeSlug,
              ),

              eq(
                stores.status,
                "ACTIVE",
              ),
            ),
          )
          .limit(1);

      if (!store) {
        return reply
          .code(404)
          .send({
            error: {
              code:
                "STORE_NOT_FOUND",

              message:
                "Store not found",
            },
          });
      }

      const [product] =
        await db
          .select()
          .from(
            products,
          )
          .where(
            and(
              eq(
                products.storeId,
                store.id,
              ),

              eq(
                products.slug,
                productSlug,
              ),

              eq(
                products.status,
                "PUBLISHED",
              ),
            ),
          )
          .limit(1);

      if (!product) {
        return reply
          .code(404)
          .send({
            error: {
              code:
                "PRODUCT_NOT_FOUND",

              message:
                "Product not found",
            },
          });
      }

      const variant =
        await getDefaultVariant(
          product.id,
        );

      if (!variant) {
        return reply
          .code(404)
          .send({
            error: {
              code:
                "VARIANT_NOT_FOUND",

              message:
                "No active default variant",
            },
          });
      }

      return {
        id:
          product.id,

        storeId:
          store.id,

        slug:
          product.slug,

        name:
          product.name,

        description:
          product.description,

        category:
          product.category,

        priceRial:
          variant.priceRial,

        priceToman:
          rialToToman(
            variant.priceRial,
          ),

        inventory:
          availableInventory(
            variant.quantityOnHand,
            variant.quantityReserved,
          ),

        store: {
          id:
            store.id,

          slug:
            store.slug,

          name:
            store.name,

          verified:
            store.verified,
        },

        source:
          "postgresql",
      };
    },
  );

  app.post(
    "/api/v1/marketplace/checkout/preview",

    async (
      request,
      reply,
    ) => {
      const parsed =
        checkoutPreviewSchema
          .safeParse(
            request.body,
          );

      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "INVALID_CART",

              message:
                "Invalid cart",

              issues:
                parsed.error.issues,
            },
          });
      }

      const config =
        await getGlobalConfig();

      const sellerOrders =
        new Map<
          string,
          {
            storeId:
              string;

            storeName:
              string;

            storeSlug:
              string;

            grossToman:
              number;

            commissionBps:
              number;

            items:
              Array<{
                productId:
                  string;

                productName:
                  string;

                quantity:
                  number;

                unitPriceToman:
                  number;

                lineTotalToman:
                  number;
              }>;
          }
        >();

      for (
        const cartItem
        of parsed.data.items
      ) {
        const [product] =
          await db
            .select()
            .from(
              products,
            )
            .where(
              and(
                eq(
                  products.id,
                  cartItem.productId,
                ),

                eq(
                  products.status,
                  "PUBLISHED",
                ),
              ),
            )
            .limit(1);

        if (!product) {
          return reply
            .code(400)
            .send({
              error: {
                code:
                  "PRODUCT_UNAVAILABLE",

                message:
                  "Product unavailable",
              },
            });
        }

        const [store] =
          await db
            .select()
            .from(
              stores,
            )
            .where(
              and(
                eq(
                  stores.id,
                  product.storeId,
                ),

                eq(
                  stores.status,
                  "ACTIVE",
                ),
              ),
            )
            .limit(1);

        if (!store) {
          return reply
            .code(400)
            .send({
              error: {
                code:
                  "STORE_UNAVAILABLE",

                message:
                  "Store unavailable",
              },
            });
        }

        const variant =
          await getDefaultVariant(
            product.id,
          );

        if (!variant) {
          return reply
            .code(400)
            .send({
              error: {
                code:
                  "VARIANT_UNAVAILABLE",

                message:
                  "Variant unavailable",
              },
            });
        }

        const available =
          availableInventory(
            variant.quantityOnHand,
            variant.quantityReserved,
          );

        if (
          cartItem.quantity >
          available
        ) {
          return reply
            .code(400)
            .send({
              error: {
                code:
                  "INSUFFICIENT_INVENTORY",

                message:
                  `Insufficient inventory for ${product.name}`,
              },
            });
        }

        const unitPriceToman =
          rialToToman(
            variant.priceRial,
          );

        const lineTotalToman =
          unitPriceToman *
          cartItem.quantity;

        const commissionBps =
          await getCommissionBps(
            store.id,
            config.defaultCommissionBps,
          );

        const existing =
          sellerOrders.get(
            store.id,
          );

        if (existing) {
          existing.grossToman +=
            lineTotalToman;

          existing.items.push({
            productId:
              product.id,

            productName:
              product.name,

            quantity:
              cartItem.quantity,

            unitPriceToman,

            lineTotalToman,
          });
        }
        else {
          sellerOrders.set(
            store.id,
            {
              storeId:
                store.id,

              storeName:
                store.name,

              storeSlug:
                store.slug,

              grossToman:
                lineTotalToman,

              commissionBps,

              items: [
                {
                  productId:
                    product.id,

                  productName:
                    product.name,

                  quantity:
                    cartItem.quantity,

                  unitPriceToman,

                  lineTotalToman,
                },
              ],
            },
          );
        }
      }

      const splitOrders =
        Array.from(
          sellerOrders.values(),
        ).map(
          (order) => {
            const commissionToman =
              calculateCommission(
                order.grossToman,
                order.commissionBps,
              );

            return {
              ...order,

              commissionPercent:
                bpsToPercent(
                  order.commissionBps,
                ),

              commissionToman,

              sellerNetToman:
                order.grossToman -
                commissionToman,

              fulfillment:
                "SELLER",
            };
          },
        );

      return {
        mode:
          "DATABASE_CHECKOUT_PREVIEW",

        customerTotalToman:
          splitOrders.reduce(
            (
              total,
              order,
            ) =>
              total +
              order.grossToman,
            0,
          ),

        platformCommissionToman:
          splitOrders.reduce(
            (
              total,
              order,
            ) =>
              total +
              order.commissionToman,
            0,
          ),

        sellerOrders:
          splitOrders,

        source:
          "postgresql",
      };
    },
  );
}