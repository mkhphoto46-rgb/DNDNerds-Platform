
import type {
  FastifyInstance,
} from "fastify";

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
  hashOrderRequest,
} from "../orders/order-idempotency.js";

import {
  inventory,
  inventoryReservations,
  marketplaceConfig,
  marketplaceOrderAddresses,
  marketplaceOrderItems,
  marketplaceOrders,
  marketplaceSellerOrders,
  productVariants,
  products,
  storeCommissionSettings,
  storeMembers,
  stores,
} from "../db/schema.js";

const addressSchema =
  z.object({
    fullName:
      z.string()
        .trim()
        .min(2)
        .max(160),

    phone:
      z.string()
        .trim()
        .min(7)
        .max(32),

    province:
      z.string()
        .trim()
        .min(2)
        .max(120),

    city:
      z.string()
        .trim()
        .min(2)
        .max(120),

    addressLine1:
      z.string()
        .trim()
        .min(5)
        .max(360),

    addressLine2:
      z.string()
        .trim()
        .max(360)
        .optional()
        .default(""),

    postalCode:
      z.string()
        .trim()
        .min(4)
        .max(32),
  });

const createOrderSchema =
  z.object({
    idempotencyKey:
      z.string()
        .min(12)
        .max(128)
        .regex(
          /^[A-Za-z0-9._:-]+$/,
        ),

    checkoutSnapshotId: z.string().uuid().optional(),
    address:
      addressSchema,

    items:
      z.array(
        z.object({
          productId:
            z.string()
              .uuid(),

          quoteId: z.string().uuid().optional(),
          variantId: z.string().uuid().optional(),
          expectedPriceRial: z.number().int().min(1000).max(2_000_000_000).optional(),
          quantity:
            z.number()
              .int()
              .min(1)
              .max(999),
        }),
      )
        .min(1)
        .max(50),
  })
    .superRefine(
      (
        value,
        context,
      ) => {
        const seen =
          new Set<string>();

        for (
          const item
          of value.items
        ) {
          if (
            seen.has(
              `${item.productId}:${item.variantId ?? "default"}`,
            )
          ) {
            context.addIssue({
              code:
                z.ZodIssueCode
                  .custom,

              message:
                "Duplicate productId values are not allowed.",

              path:
                [
                  "items",
                ],
            });

            return;
          }

          seen.add(
            `${item.productId}:${item.variantId ?? "default"}`,
          );
        }
      },
    );

class CheckoutConflict
  extends Error {
  public readonly statusCode:
    number;

  public readonly code:
    string;

  public readonly details?:
    unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);

    this.name =
      "CheckoutConflict";

    this.statusCode =
      statusCode;

    this.code =
      code;

    this.details =
      details;
  }
}

function rialToToman(
  value: number,
) {
  return Math.trunc(
    value / 10,
  );
}

function bpsAmount(
  amount: number,
  bps: number,
) {
  return Math.round(
    (
      amount *
      bps
    ) /
    10_000,
  );
}

async function loadOrderResponse(
  orderId: string,
  userId: string,
) {
  const [
    order,
  ] =
    await db
      .select()
      .from(
        marketplaceOrders,
      )
      .where(
        and(
          eq(
            marketplaceOrders.id,
            orderId,
          ),

          eq(
            marketplaceOrders.userId,
            userId,
          ),
        ),
      )
      .limit(1);

  if (!order) {
    return null;
  }

  const sellerRows =
    await db
      .select({
        id:
          marketplaceSellerOrders.id,

        storeId:
          marketplaceSellerOrders.storeId,

        storeName:
          stores.name,

        storeSlug:
          stores.slug,

        status:
          marketplaceSellerOrders.status,

        grossRial:
          marketplaceSellerOrders.grossRial,

        commissionBpsSnapshot:
          marketplaceSellerOrders.commissionBpsSnapshot,

        platformCommissionRial:
          marketplaceSellerOrders.platformCommissionRial,

        sellerNetRial:
          marketplaceSellerOrders.sellerNetRial,
      })
      .from(
        marketplaceSellerOrders,
      )
      .innerJoin(
        stores,
        eq(
          stores.id,
          marketplaceSellerOrders.storeId,
        ),
      )
      .where(
        eq(
          marketplaceSellerOrders.orderId,
          order.id,
        ),
      );

  const itemRows =
    await db
      .select()
      .from(
        marketplaceOrderItems,
      )
      .where(
        eq(
          marketplaceOrderItems.orderId,
          order.id,
        ),
      );

  const [
    address,
  ] =
    await db
      .select()
      .from(
        marketplaceOrderAddresses,
      )
      .where(
        eq(
          marketplaceOrderAddresses.orderId,
          order.id,
        ),
      )
      .limit(1);

  return {
    order: {
      id:
        order.id,

      status:
        order.status,

      currency:
        order.currency,

      customerTotalRial:
        order.customerTotalRial,

      customerTotalToman:
        rialToToman(
          order.customerTotalRial,
        ),

      platformCommissionRial:
        order.platformCommissionRial,

      platformCommissionToman:
        rialToToman(
          order.platformCommissionRial,
        ),

      sellerNetRial:
        order.sellerNetRial,

      sellerNetToman:
        rialToToman(
          order.sellerNetRial,
        ),

      expiresAt:
        order.expiresAt,

      createdAt:
        order.createdAt,
    },

    address:
      address
        ? {
            fullName:
              address.fullName,

            phone:
              address.phone,

            countryCode:
              address.countryCode,

            province:
              address.province,

            city:
              address.city,

            addressLine1:
              address.addressLine1,

            addressLine2:
              address.addressLine2,

            postalCode:
              address.postalCode,
          }
        : null,

    sellerOrders:
      sellerRows.map(
        (
          sellerOrder,
        ) => ({
          id:
            sellerOrder.id,

          storeId:
            sellerOrder.storeId,

          storeName:
            sellerOrder.storeName,

          storeSlug:
            sellerOrder.storeSlug,

          status:
            sellerOrder.status,

          grossRial:
            sellerOrder.grossRial,

          grossToman:
            rialToToman(
              sellerOrder.grossRial,
            ),

          commissionBps:
            sellerOrder.commissionBpsSnapshot,

          platformCommissionRial:
            sellerOrder.platformCommissionRial,

          platformCommissionToman:
            rialToToman(
              sellerOrder.platformCommissionRial,
            ),

          sellerNetRial:
            sellerOrder.sellerNetRial,

          sellerNetToman:
            rialToToman(
              sellerOrder.sellerNetRial,
            ),

          items:
            itemRows
              .filter(
                (item) =>
                  item.sellerOrderId ===
                  sellerOrder.id,
              )
              .map(
                (item) => ({
                  id:
                    item.id,

                  productId:
                    item.productId,

                  variantId:
                    item.variantId,

                  productName:
                    item.productNameSnapshot,

                  productSlug:
                    item.productSlugSnapshot,

                  variantName:
                    item.variantNameSnapshot,

                  sku:
                    item.skuSnapshot,

                  quantity:
                    item.quantity,

                  unitPriceRial:
                    item.unitPriceRial,

                  unitPriceToman:
                    rialToToman(
                      item.unitPriceRial,
                    ),

                  lineTotalRial:
                    item.lineTotalRial,

                  lineTotalToman:
                    rialToToman(
                      item.lineTotalRial,
                    ),
                }),
              ),
        }),
      ),

    source:
      "postgresql" as const,
  };
}

function assertOrderIdempotencyMatch(
  existing: {
    userId: string | null;
    requestHash: string | null;
  },
  userId: string,
  requestHash: string,
) {
  if (
    existing.userId !==
    userId
  ) {
    throw new CheckoutConflict(
      409,
      "IDEMPOTENCY_KEY_CONFLICT",
      "Order idempotency key is already owned by another account.",
    );
  }

  if (
    !existing.requestHash
  ) {
    throw new CheckoutConflict(
      409,
      "IDEMPOTENCY_PAYLOAD_UNVERIFIABLE",
      "This legacy order does not contain a request hash and cannot be safely replayed.",
    );
  }

  if (
    existing.requestHash !==
    requestHash
  ) {
    throw new CheckoutConflict(
      409,
      "IDEMPOTENCY_PAYLOAD_CONFLICT",
      "The same order idempotency key was reused with a different payload.",
    );
  }
}

type PreparedLine = {
  productId: string;
  productName: string;
  productSlug: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  variantId: string;
  variantName: string;
  sku: string;
  priceRial: number;
  quantityOnHand: number;
  quantityReserved: number;
  quantity: number;
  commissionBps: number;
  lineTotalRial: number;
  commissionRial: number;
  sellerNetRial: number;
};

export async function registerOrderRoutes(
  app: FastifyInstance,
) {
  app.post(
    "/api/v1/marketplace/orders",
    async (
      request,
      reply,
    ) => {
      const authUser =
        await requireAuthUser(
          request,
        );

      if (!authUser) {
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

      const parsed =
        createOrderSchema
          .safeParse(
            request.body,
          );

      if (!parsed.success) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Invalid order request.",

              issues:
                parsed.error
                  .issues,
            },
          });
      }

      const {
        idempotencyKey,
        checkoutSnapshotId,
        items,
        address,
      } =
        parsed.data;

      const requestHash =
        hashOrderRequest(
          parsed.data,
        );

      const [
        existing,
      ] =
        await db
          .select({
            id:
              marketplaceOrders.id,

            userId:
              marketplaceOrders.userId,

            requestHash:
              marketplaceOrders.requestHash,
          })
          .from(
            marketplaceOrders,
          )
          .where(
            eq(
              marketplaceOrders.idempotencyKey,
              idempotencyKey,
            ),
          )
          .limit(1);

      if (existing) {
        try {
          assertOrderIdempotencyMatch(
            existing,
            authUser.id,
            requestHash,
          );
        }
        catch (error) {
          if (
            error instanceof
            CheckoutConflict
          ) {
            return reply
              .code(
                error.statusCode,
              )
              .send({
                error: {
                  code:
                    error.code,

                  message:
                    error.message,

                  details:
                    error.details,
                },
              });
          }

          throw error;
        }

        const loaded =
          await loadOrderResponse(
            existing.id,
            authUser.id,
          );

        return reply
          .code(200)
          .send({
            ...loaded,

            idempotent:
              true,
          });
      }

      let creationResult:
        {
          id: string;
          idempotent: boolean;
        };

      try {
        creationResult =
          await db.transaction(
            async (
              tx,
            ) => {
              await tx.execute(
                sql`
                  SELECT pg_advisory_xact_lock(
                    hashtextextended(
                      ${`order-idempotency:${authUser.id}:${idempotencyKey}`},
                      0
                    )
                  )
                `,
              );

              const [
                lockedExisting,
              ] =
                await tx
                  .select({
                    id:
                      marketplaceOrders.id,

                    userId:
                      marketplaceOrders.userId,

                    requestHash:
                      marketplaceOrders.requestHash,
                  })
                  .from(
                    marketplaceOrders,
                  )
                  .where(
                    eq(
                      marketplaceOrders.idempotencyKey,
                      idempotencyKey,
                    ),
                  )
                  .limit(1);

              if (lockedExisting) {
                assertOrderIdempotencyMatch(
                  lockedExisting,
                  authUser.id,
                  requestHash,
                );

                return {
                  id:
                    lockedExisting.id,

                  idempotent:
                    true,
                };
              }

              const [
                globalConfig,
              ] =
                await tx
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

              if (!globalConfig) {
                throw new Error(
                  "Marketplace global config is missing.",
                );
              }

              const productIds:
                string[] =
                items.map(
                  (item) =>
                    item.productId,
                );

              // Serialize exposure across every SKU of a store in a stable lock order.
              const scopedStores = await tx.select({id:products.storeId}).from(products).where(inArray(products.id,productIds));
              // B52: every order route needs a verified buyer, and a store's own members can't buy from it.
              const verified=await tx.execute(sql`SELECT u.email_verified,b.mobile_verified_at,b.evidence_ref FROM users u LEFT JOIN marketplace_buyer_verifications b ON b.user_id=u.id WHERE u.id=${authUser.id}`);
              if(!verified[0]?.email_verified||!verified[0]?.mobile_verified_at||!verified[0]?.evidence_ref)throw new CheckoutConflict(403,"BUYER_VERIFICATION_REQUIRED","Verify email and mobile before checkout.");
              const scopedStoreIds=[...new Set(scopedStores.map(r=>r.id))];
              if(scopedStoreIds.length){
                const own=await tx.select({storeId:storeMembers.storeId}).from(storeMembers).where(and(eq(storeMembers.userId,authUser.id),inArray(storeMembers.storeId,scopedStoreIds))).limit(1);
                if(own.length)throw new CheckoutConflict(403,"SELF_PURCHASE","You can't order from a store you belong to.");
              }
              await tx.select({id:stores.id}).from(stores).where(inArray(stores.id,[...new Set(scopedStores.map(r=>r.id))])).orderBy(stores.id).for("update");

              const productRows =
                await tx
                  .select({
                    productId:
                      products.id,

                    productName:
                      products.name,

                    productSlug:
                      products.slug,

                    storeId:
                      stores.id,

                    storeName:
                      stores.name,

                    storeSlug:
                      stores.slug,

                    variantId:
                      productVariants.id,

                    variantName:
                      productVariants.name,

                    sku:
                      productVariants.sku,

                    priceRial: sql<number>`CASE WHEN now() >= ${productVariants}.discount_starts_at AND now() < ${productVariants}.discount_ends_at THEN ${productVariants}.discount_rial ELSE ${productVariants.priceRial} END`.mapWith(Number),
                    isDefault: productVariants.isDefault,
                    perOrderLimit: sql<number>`${productVariants}.per_order_limit`.mapWith(Number),
                    productType: sql<string>`${products}.product_type`,

                    quantityOnHand:
                      inventory.quantityOnHand,

                    quantityReserved:
                      inventory.quantityReserved,
                  })
                  .from(
                    products,
                  )
                  .innerJoin(
                    stores,
                    eq(
                      stores.id,
                      products.storeId,
                    ),
                  )
                  .innerJoin(
                    productVariants,
                    and(
                      eq(
                        productVariants.productId,
                        products.id,
                      ),

                      eq(
                        productVariants.status,
                        "ACTIVE",
                      ),
                    ),
                  )
                  .innerJoin(
                    inventory,
                    eq(
                      inventory.variantId,
                      productVariants.id,
                    ),
                  )
                  .where(
                    and(
                      inArray(
                        products.id,
                        productIds,
                      ),

                      eq(
                        products.status,
                        "PUBLISHED",
                      ),

                      eq(
                        stores.status,
                        "ACTIVE",
                      ),
                    ),
                  ).orderBy(productVariants.id).for("update");

              if (
                productRows.length === 0
              ) {
                throw new CheckoutConflict(
                  409,
                  "PRODUCT_UNAVAILABLE",
                  "One or more products are unavailable.",
                );
              }

              const rowByProductId =
                new Map<
                  string,
                  (typeof productRows)[number]
                >(
                  productRows.map(
                    (row) => [
                      `${row.productId}:${row.variantId}`,
                      row,
                    ],
                  ),
                );

              const storeIds:
                string[] =
                [
                  ...new Set(
                    productRows.map(
                      (row) =>
                        row.storeId,
                    ),
                  ),
                ];

              const overrideRows =
                storeIds.length > 0
                  ? await tx
                      .select()
                      .from(
                        storeCommissionSettings,
                      )
                      .where(
                        and(
                          inArray(
                            storeCommissionSettings.storeId,
                            storeIds,
                          ),

                          eq(
                            storeCommissionSettings.active,
                            true,
                          ),
                        ),
                      )
                  : [];

              const overrideByStore =
                new Map<
                  string,
                  number
                >(
                  overrideRows.map(
                    (row) => [
                      row.storeId,
                      row.commissionBps,
                    ],
                  ),
                );

              const quoteRows = new Map<string,Record<string,unknown>>();
              for(const item of items.filter(x=>x.quoteId)) {
                const result=await tx.execute(sql`SELECT v.*,r.buyer_id,r.store_id,r.quantity FROM marketplace_quotes v JOIN marketplace_custom_requests r ON r.id=v.request_id WHERE v.id=${item.quoteId!} FOR UPDATE OF v`);
                const v=result[0];
                if(!v || v.buyer_id!==authUser.id || !v.accepted_at || v.order_id || new Date(String(v.expires_at))<=new Date() || Number(v.quantity)!==item.quantity)throw new CheckoutConflict(409,"QUOTE_INVALID","Quote expired, consumed or not accepted.");
                if(quoteRows.has(item.quoteId!))throw new CheckoutConflict(409,"DUPLICATE_QUOTE","Quote cannot be used twice.");
                quoteRows.set(item.quoteId!,v);
              }
              const shippingByStore = new Map<string,{storeId:string;feeRial:number;version:number;method:string;dispatchDays:number}>();
              if(checkoutSnapshotId){
                const snap=await tx.execute(sql`SELECT * FROM marketplace_checkout_snapshots WHERE id=${checkoutSnapshotId} AND user_id=${authUser.id} FOR UPDATE`);
                const snapshot=snap[0];
                if(!snapshot||snapshot.order_id||new Date(String(snapshot.expires_at))<=new Date())throw new CheckoutConflict(409,"SNAPSHOT_EXPIRED","Review checkout again.");
                const accepted=snapshot.items as typeof items;
                if(accepted.length!==items.length||accepted.some(a=>!items.some(b=>a.productId===b.productId&&a.variantId===b.variantId&&a.quantity===b.quantity&&a.expectedPriceRial===b.expectedPriceRial&&a.quoteId===b.quoteId)))throw new CheckoutConflict(409,"SNAPSHOT_MISMATCH","Accepted checkout items changed.");
                for(const shipping of snapshot.shipping as Array<{storeId:string;feeRial:number;version:number;method:string;dispatchDays:number}>){
                  const current=await tx.execute(sql`SELECT * FROM marketplace_shipping_profiles WHERE store_id=${shipping.storeId} FOR UPDATE`);
                  if(!current[0]||Number(current[0].version)!==shipping.version||Number(current[0].fee_rial)!==shipping.feeRial)throw new CheckoutConflict(409,"SHIPPING_CHANGED","Shipping changed; review and accept again.");
                  shippingByStore.set(shipping.storeId,shipping);
                }
              }

              const prepared:
                PreparedLine[] =
                items.map(
                  (requested) => {
                    const row = requested.variantId
                      ? rowByProductId.get(`${requested.productId}:${requested.variantId}`)
                      : productRows.find(r=>r.productId===requested.productId && r.isDefault);

                    if (!row) {
                      throw new CheckoutConflict(
                        409,
                        "PRODUCT_UNAVAILABLE",
                        "Product is unavailable.",
                        {
                          productId:
                            requested.productId,
                        },
                      );
                    }

                    if (row.productType === "CUSTOM_DESIGN") {
                      const quote=requested.quoteId?quoteRows.get(requested.quoteId):undefined;
                      if(!quote||quote.store_id!==row.storeId)throw new CheckoutConflict(409,"QUOTE_REQUIRED","Custom products require an accepted quote for this store.");
                      row.priceRial=Number(quote.price_rial);
                    } else if(requested.quoteId)throw new CheckoutConflict(409,"QUOTE_TYPE_MISMATCH","Only custom products can use a quote.");
                    if (requested.quantity > row.perOrderLimit) throw new CheckoutConflict(409,"QUANTITY_LIMIT","Variant purchase limit exceeded.");
                    if (requested.variantId && requested.expectedPriceRial === undefined) throw new CheckoutConflict(409,"PRICE_ACCEPTANCE_REQUIRED","Accept the current variant price.");
                    if (requested.expectedPriceRial !== undefined && requested.expectedPriceRial !== row.priceRial) throw new CheckoutConflict(409,"PRICE_CHANGED","Price changed; review and accept the current price.");

                    const commissionBps =
                      overrideByStore.get(
                        row.storeId,
                      ) ??
                      globalConfig.defaultCommissionBps;

                    const lineTotalRial =
                      row.priceRial *
                      requested.quantity;

                    const commissionRial =
                      bpsAmount(
                        lineTotalRial,
                        commissionBps,
                      );

                    return {
                      ...row,

                      quantity:
                        requested.quantity,

                      commissionBps,

                      lineTotalRial,

                      commissionRial,

                      sellerNetRial:
                        lineTotalRial -
                        commissionRial,
                    };
                  },
                );

              if(new Set(prepared.map(r=>r.variantId)).size!==prepared.length)throw new CheckoutConflict(409,"DUPLICATE_VARIANT","The same SKU cannot occur more than once.");

              for(const storeId of new Set(prepared.map(r=>r.storeId))) {
                const result = await tx.execute(sql`SELECT s.risk_cap_rial as cap,coalesce((SELECT sum(so.gross_rial) FROM marketplace_seller_orders so WHERE so.store_id=s.id AND so.status NOT IN ('CANCELLED','REFUNDED')),0) as exposure FROM stores s WHERE s.id=${storeId}`);
                const incoming=prepared.filter(r=>r.storeId===storeId).reduce((n,r)=>n+r.lineTotalRial,0)+(shippingByStore.get(storeId)?.feeRial??0);
                if(Number(result[0]?.exposure??0)+incoming>Number(result[0]?.cap??0))throw new CheckoutConflict(409,"SELLER_EXPOSURE_LIMIT","Seller open exposure limit exceeded.");
              }

              const shippingTotalRial=[...shippingByStore.values()].reduce((n,s)=>n+s.feeRial,0);
              const customerTotalRial = shippingTotalRial +
                prepared.reduce(
                  (
                    total,
                    item,
                  ) =>
                    total +
                    item.lineTotalRial,
                  0,
                );

              if(!Number.isSafeInteger(customerTotalRial)||customerTotalRial>2_000_000_000)throw new CheckoutConflict(409,"ORDER_AMOUNT_LIMIT","Order total exceeds the supported payment amount.");

              const platformCommissionRial =
                prepared.reduce(
                  (
                    total,
                    item,
                  ) =>
                    total +
                    item.commissionRial,
                  0,
                );

              const sellerNetRial =
                customerTotalRial -
                platformCommissionRial;

              const now =
                new Date();

              const expiresAt =
                new Date(
                  now.getTime() +
                  15 *
                    60 *
                    1000,
                );

              const [
                createdOrder,
              ] =
                await tx
                  .insert(
                    marketplaceOrders,
                  )
                  .values({
                    userId:
                      authUser.id,

                    idempotencyKey,

                    requestHash,

                    status:
                      "PENDING_PAYMENT",

                    currency:
                      "IRR",

                    customerTotalRial,

                    platformCommissionRial,

                    sellerNetRial,

                    expiresAt,

                    updatedAt:
                      now,
                  })
                  .returning({
                    id:
                      marketplaceOrders.id,
                  });

              if (!createdOrder) {
                throw new Error(
                  "Order insert failed.",
                );
              }

              await tx.execute(sql`UPDATE marketplace_orders SET shipping_total_rial=${shippingTotalRial} WHERE id=${createdOrder.id}`);
              if(checkoutSnapshotId)await tx.execute(sql`UPDATE marketplace_checkout_snapshots SET order_id=${createdOrder.id} WHERE id=${checkoutSnapshotId}`);
              for(const quoteId of quoteRows.keys())await tx.execute(sql`UPDATE marketplace_quotes SET order_id=${createdOrder.id} WHERE id=${quoteId}`);

              await tx
                .insert(
                  marketplaceOrderAddresses,
                )
                .values({
                  orderId:
                    createdOrder.id,

                  fullName:
                    address.fullName,

                  phone:
                    address.phone,

                  countryCode:
                    "IR",

                  province:
                    address.province,

                  city:
                    address.city,

                  addressLine1:
                    address.addressLine1,

                  addressLine2:
                    address.addressLine2 ||
                    null,

                  postalCode:
                    address.postalCode,
                });

              for (
                const item
                of prepared
              ) {
                const reservedRows =
                  await tx
                    .update(
                      inventory,
                    )
                    .set({
                      quantityReserved:
                        sql`${inventory.quantityReserved} + ${item.quantity}`,

                      updatedAt:
                        now,
                    })
                    .where(
                      and(
                        eq(
                          inventory.variantId,
                          item.variantId,
                        ),

                        sql`${inventory.quantityOnHand} - ${inventory.quantityReserved} >= ${item.quantity}`,
                      ),
                    )
                    .returning({
                      id:
                        inventory.id,
                    });

                if (
                  reservedRows.length !==
                  1
                ) {
                  throw new CheckoutConflict(
                    409,
                    "INSUFFICIENT_STOCK",
                    "Insufficient inventory.",
                    {
                      productId:
                        item.productId,

                      requestedQuantity:
                        item.quantity,
                    },
                  );
                }
              }

              const preparedByStore =
                new Map<
                  string,
                  PreparedLine[]
                >();

              for (
                const item
                of prepared
              ) {
                const group =
                  preparedByStore.get(
                    item.storeId,
                  ) ??
                  [];

                group.push(
                  item,
                );

                preparedByStore.set(
                  item.storeId,
                  group,
                );
              }

              for (
                const [
                  storeId,
                  group,
                ]
                of preparedByStore
              ) {
                const grossRial = (shippingByStore.get(storeId)?.feeRial??0) +
                  group.reduce(
                    (
                      total,
                      item,
                    ) =>
                      total +
                      item.lineTotalRial,
                    0,
                  );

                const commissionRial =
                  group.reduce(
                    (
                      total,
                      item,
                    ) =>
                      total +
                      item.commissionRial,
                    0,
                  );

                const sellerNetForStore =
                  grossRial -
                  commissionRial;

                const commissionBpsSnapshot =
                  group[0]
                    ?.commissionBps ??
                  globalConfig
                    .defaultCommissionBps;

                const [
                  sellerOrder,
                ] =
                  await tx
                    .insert(
                      marketplaceSellerOrders,
                    )
                    .values({
                      orderId:
                        createdOrder.id,

                      storeId,

                      status:
                        "PENDING_PAYMENT",

                      currency:
                        "IRR",

                      grossRial,

                      commissionBpsSnapshot,

                      platformCommissionRial:
                        commissionRial,

                      sellerNetRial:
                        sellerNetForStore,

                      updatedAt:
                        now,
                    })
                    .returning({
                      id:
                        marketplaceSellerOrders.id,
                    });

                if (!sellerOrder) {
                  throw new Error(
                    "Seller order insert failed.",
                  );
                }

                if(shippingByStore.has(storeId))await tx.execute(sql`UPDATE marketplace_seller_orders SET shipping_snapshot=${JSON.stringify(shippingByStore.get(storeId))}::jsonb WHERE id=${sellerOrder.id}`);

                for (
                  const item
                  of group
                ) {
                  const [
                    orderItem,
                  ] =
                    await tx
                      .insert(
                        marketplaceOrderItems,
                      )
                      .values({
                        orderId:
                          createdOrder.id,

                        sellerOrderId:
                          sellerOrder.id,

                        storeId:
                          item.storeId,

                        productId:
                          item.productId,

                        variantId:
                          item.variantId,

                        productNameSnapshot:
                          item.productName,

                        productSlugSnapshot:
                          item.productSlug,

                        variantNameSnapshot:
                          item.variantName,

                        skuSnapshot:
                          item.sku,

                        quantity:
                          item.quantity,

                        unitPriceRial:
                          item.priceRial,

                        lineTotalRial:
                          item.lineTotalRial,

                        commissionBpsSnapshot:
                          item.commissionBps,

                        commissionRial:
                          item.commissionRial,

                        sellerNetRial:
                          item.sellerNetRial,
                      })
                      .returning({
                        id:
                          marketplaceOrderItems.id,
                      });

                  if (!orderItem) {
                    throw new Error(
                      "Order item insert failed.",
                    );
                  }

                  await tx
                    .insert(
                      inventoryReservations,
                    )
                    .values({
                      orderId:
                        createdOrder.id,

                      orderItemId:
                        orderItem.id,

                      variantId:
                        item.variantId,

                      quantity:
                        item.quantity,

                      status:
                        "ACTIVE",

                      expiresAt,
                    });
                }
              }


              return {
                id:
                  createdOrder.id,

                idempotent:
                  false,
              };
            },
          );
      }
      catch (error) {
        const postgresError =
          error as {
            code?: string;
          };

        if (
          postgresError.code ===
          "23505"
        ) {
          const [
            duplicate,
          ] =
            await db
              .select({
                id:
                  marketplaceOrders.id,

                userId:
                  marketplaceOrders.userId,

                requestHash:
                  marketplaceOrders.requestHash,
              })
              .from(
                marketplaceOrders,
              )
              .where(
                eq(
                  marketplaceOrders.idempotencyKey,
                  idempotencyKey,
                ),
              )
              .limit(1);

          if (duplicate) {
            try {
              assertOrderIdempotencyMatch(
                duplicate,
                authUser.id,
                requestHash,
              );
            }
            catch (conflict) {
              if (
                conflict instanceof
                CheckoutConflict
              ) {
                return reply
                  .code(
                    conflict.statusCode,
                  )
                  .send({
                    error: {
                      code:
                        conflict.code,

                      message:
                        conflict.message,

                      details:
                        conflict.details,
                    },
                  });
              }

              throw conflict;
            }

            const loaded =
              await loadOrderResponse(
                duplicate.id,
                authUser.id,
              );

            return reply
              .code(200)
              .send({
                ...loaded,

                idempotent:
                  true,
              });
          }
        }

        if (
          error instanceof
          CheckoutConflict
        ) {
          return reply
            .code(
              error.statusCode,
            )
            .send({
              error: {
                code:
                  error.code,

                message:
                  error.message,

                details:
                  error.details,
              },
            });
        }

        throw error;
      }

      const loaded =
        await loadOrderResponse(
          creationResult.id,
          authUser.id,
        );

      return reply
        .code(
          creationResult.idempotent
            ? 200
            : 201,
        )
        .send({
          ...loaded,

          idempotent:
            creationResult.idempotent,
        });
    },
  );


  app.get(
    "/api/v1/marketplace/orders",
    async (
      request,
      reply,
    ) => {
      const authUser =
        await requireAuthUser(
          request,
        );

      if (!authUser) {
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
          .select({
            id:
              marketplaceOrders.id,

            status:
              marketplaceOrders.status,

            customerTotalRial:
              marketplaceOrders.customerTotalRial,

            createdAt:
              marketplaceOrders.createdAt,

            expiresAt:
              marketplaceOrders.expiresAt,
          })
          .from(
            marketplaceOrders,
          )
          .where(
            eq(
              marketplaceOrders.userId,
              authUser.id,
            ),
          )
          .orderBy(
            desc(
              marketplaceOrders.createdAt,
            ),
          );

      return {
        data:
          rows.map(
            (row) => ({
              ...row,

              customerTotalToman:
                rialToToman(
                  row.customerTotalRial,
                ),
            }),
          ),

        source:
          "postgresql" as const,
      };
    },
  );

  app.get(
    "/api/v1/marketplace/orders/:orderId",
    async (
      request,
      reply,
    ) => {
      const authUser =
        await requireAuthUser(
          request,
        );

      if (!authUser) {
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

      const params =
        z.object({
          orderId:
            z.string()
              .uuid(),
        })
          .safeParse(
            request.params,
          );

      if (!params.success) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Invalid order id.",
            },
          });
      }

      const loaded =
        await loadOrderResponse(
          params.data.orderId,
          authUser.id,
        );

      if (!loaded) {
        return reply
          .code(404)
          .send({
            error: {
              code:
                "ORDER_NOT_FOUND",

              message:
                "Order was not found.",
            },
          });
      }

      return loaded;
    },
  );

  app.post(
    "/api/v1/marketplace/orders/:orderId/cancel",
    async (
      request,
      reply,
    ) => {
      const authUser =
        await requireAuthUser(
          request,
        );

      if (!authUser) {
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

      const params =
        z.object({
          orderId:
            z.string()
              .uuid(),
        })
          .safeParse(
            request.params,
          );

      if (!params.success) {
        return reply
          .code(400)
          .send({
            error: {
              code:
                "VALIDATION_ERROR",

              message:
                "Invalid order id.",
            },
          });
      }

      try {
        await db.transaction(
          async (
            tx,
          ) => {
            const [
              order,
            ] =
              await tx
                .select()
                .from(
                  marketplaceOrders,
                )
                .where(
                  and(
                    eq(
                      marketplaceOrders.id,
                      params.data.orderId,
                    ),

                    eq(
                      marketplaceOrders.userId,
                      authUser.id,
                    ),
                  ),
                )
                .limit(1);

            if (!order) {
              throw new CheckoutConflict(
                404,
                "ORDER_NOT_FOUND",
                "Order was not found.",
              );
            }

            if (
              order.status ===
              "CANCELLED"
            ) {
              return;
            }

            if (
              order.status !==
              "PENDING_PAYMENT"
            ) {
              throw new CheckoutConflict(
                409,
                "ORDER_NOT_CANCELLABLE",
                "Only pending-payment orders can be cancelled here.",
              );
            }

            const activeReservations =
              await tx
                .select()
                .from(
                  inventoryReservations,
                )
                .where(
                  and(
                    eq(
                      inventoryReservations.orderId,
                      order.id,
                    ),

                    eq(
                      inventoryReservations.status,
                      "ACTIVE",
                    ),
                  ),
                );

            const now =
              new Date();

            for (
              const reservation
              of activeReservations
            ) {
              await tx
                .update(
                  inventory,
                )
                .set({
                  quantityReserved:
                    sql`GREATEST(${inventory.quantityReserved} - ${reservation.quantity}, 0)`,

                  updatedAt:
                    now,
                })
                .where(
                  eq(
                    inventory.variantId,
                    reservation.variantId,
                  ),
                );
            }

            await tx
              .update(
                inventoryReservations,
              )
              .set({
                status:
                  "RELEASED",

                releasedAt:
                  now,
              })
              .where(
                and(
                  eq(
                    inventoryReservations.orderId,
                    order.id,
                  ),

                  eq(
                    inventoryReservations.status,
                    "ACTIVE",
                  ),
                ),
              );

            await tx
              .update(
                marketplaceSellerOrders,
              )
              .set({
                status:
                  "CANCELLED",

                updatedAt:
                  now,
              })
              .where(
                eq(
                  marketplaceSellerOrders.orderId,
                  order.id,
                ),
              );

            await tx
              .update(
                marketplaceOrders,
              )
              .set({
                status:
                  "CANCELLED",

                updatedAt:
                  now,
              })
              .where(
                eq(
                  marketplaceOrders.id,
                  order.id,
                ),
              );
          },
        );
      }
      catch (error) {
        if (
          error instanceof
          CheckoutConflict
        ) {
          return reply
            .code(
              error.statusCode,
            )
            .send({
              error: {
                code:
                  error.code,

                message:
                  error.message,
              },
            });
        }

        throw error;
      }

      const loaded =
        await loadOrderResponse(
          params.data.orderId,
          authUser.id,
        );

      return reply
        .code(200)
        .send({
          ...loaded,

          released:
            true,
        });
    },
  );
}
