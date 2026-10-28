import { sql } from "drizzle-orm";

import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userStatusEnum =
  pgEnum("user_status", [
    "PENDING_APPROVAL",
    "ACTIVE",
    "SUSPENDED",
    "BANNED",
  ]);

export const sellerStatusEnum =
  pgEnum("seller_status", [
    "PENDING_REVIEW",
    "ACTIVE",
    "SUSPENDED",
    "REJECTED",
  ]);

export const storeStatusEnum =
  pgEnum("store_status", [
    "DRAFT",
    "PENDING_REVIEW",
    "ACTIVE",
    "SUSPENDED",
    "ARCHIVED",
  ]);

export const storeMemberRoleEnum =
  pgEnum("store_member_role", [
    "OWNER",
    "MANAGER",
    "ORDER_MANAGER",
    "PRODUCT_EDITOR",
  ]);

export const fulfillmentModeEnum =
  pgEnum("fulfillment_mode", [
    "SELLER",
  ]);

export const productStatusEnum =
  pgEnum("product_status", [
    "DRAFT",
    "PUBLISHED",
    "ARCHIVED",
  ]);

export const variantStatusEnum =
  pgEnum("variant_status", [
    "ACTIVE",
    "INACTIVE",
    "ARCHIVED",
  ]);

export const users =
  pgTable(
    "users",
    {
      id:
        uuid("id")
          .primaryKey()
          .defaultRandom(),

      email:
        varchar("email", {
          length: 320,
        })
          .notNull()
          .unique(),

      username:
        varchar("username", { length: 32 }),

      passwordHash:
        text("password_hash"),

      status:
        userStatusEnum("status")
          .notNull()
          .default("ACTIVE"),

      emailVerified:
        boolean("email_verified")
          .notNull()
          .default(false),

      createdAt:
        timestamp("created_at", {
          withTimezone: true,
        })
          .notNull()
          .defaultNow(),

      updatedAt:
        timestamp("updated_at", {
          withTimezone: true,
        })
          .notNull()
          .defaultNow(),
    },
  );

export const sellerProfiles =
  pgTable(
    "seller_profiles",
    {
      id:
        uuid("id")
          .primaryKey()
          .defaultRandom(),

      userId:
        uuid("user_id")
          .notNull()
          .unique()
          .references(
            () => users.id,
            {
              onDelete: "cascade",
            },
          ),

      displayName:
        varchar("display_name", {
          length: 160,
        })
          .notNull(),

      status:
        sellerStatusEnum("status")
          .notNull()
          .default("PENDING_REVIEW"),

      createdAt:
        timestamp("created_at", {
          withTimezone: true,
        })
          .notNull()
          .defaultNow(),

      updatedAt:
        timestamp("updated_at", {
          withTimezone: true,
        })
          .notNull()
          .defaultNow(),
    },
  );

export const stores =
  pgTable(
    "stores",
    {
      id:
        uuid("id")
          .primaryKey()
          .defaultRandom(),

      sellerProfileId:
        uuid("seller_profile_id")
          .notNull()
          .references(
            () => sellerProfiles.id,
            {
              onDelete: "cascade",
            },
          ),

      slug:
        varchar("slug", {
          length: 120,
        })
          .notNull()
          .unique(),

      name:
        varchar("name", {
          length: 180,
        })
          .notNull(),

      description:
        text("description")
          .notNull()
          .default(""),

      category:
        varchar("category", {
          length: 120,
        })
          .notNull(),

      status:
        storeStatusEnum("status")
          .notNull()
          .default("DRAFT"),

      verified:
        boolean("verified")
          .notNull()
          .default(false),

      fulfillmentMode:
        fulfillmentModeEnum("fulfillment_mode")
          .notNull()
          .default("SELLER"),

      ratingHundredths:
        integer("rating_hundredths")
          .notNull()
          .default(0),

      reviewCount:
        integer("review_count")
          .notNull()
          .default(0),

      createdAt:
        timestamp("created_at", {
          withTimezone: true,
        })
          .notNull()
          .defaultNow(),

      updatedAt:
        timestamp("updated_at", {
          withTimezone: true,
        })
          .notNull()
          .defaultNow(),
    },

    (table) => [
      index("stores_status_idx")
        .on(table.status),

      check(
        "stores_rating_range",
        sql`
          ${table.ratingHundredths} >= 0
          AND
          ${table.ratingHundredths} <= 500
        `,
      ),
    ],
  );

export const storeMembers =
  pgTable(
    "store_members",
    {
      id:
        uuid("id")
          .primaryKey()
          .defaultRandom(),

      storeId:
        uuid("store_id")
          .notNull()
          .references(
            () => stores.id,
            {
              onDelete: "cascade",
            },
          ),

      userId:
        uuid("user_id")
          .notNull()
          .references(
            () => users.id,
            {
              onDelete: "cascade",
            },
          ),

      role:
        storeMemberRoleEnum("role")
          .notNull(),

      createdAt:
        timestamp("created_at", {
          withTimezone: true,
        })
          .notNull()
          .defaultNow(),
    },

    (table) => [
      uniqueIndex(
        "store_members_store_user_unique",
      ).on(
        table.storeId,
        table.userId,
      ),
    ],
  );

export const marketplaceConfig =
  pgTable(
    "marketplace_config",
    {
      id:
        varchar("id", {
          length: 32,
        })
          .primaryKey(),

      defaultCommissionBps:
        integer("default_commission_bps")
          .notNull()
          .default(500),

      multiVendorCart:
        boolean("multi_vendor_cart")
          .notNull()
          .default(true),

      sellerFulfillment:
        boolean("seller_fulfillment")
          .notNull()
          .default(true),

      platformOwnInventory:
        boolean("platform_own_inventory")
          .notNull()
          .default(false),

      updatedAt:
        timestamp("updated_at", {
          withTimezone: true,
        })
          .notNull()
          .defaultNow(),
    },

    (table) => [
      check(
        "marketplace_commission_range",
        sql`
          ${table.defaultCommissionBps} >= 0
          AND
          ${table.defaultCommissionBps} <= 10000
        `,
      ),
    ],
  );

export const storeCommissionSettings =
  pgTable(
    "store_commission_settings",
    {
      id:
        uuid("id")
          .primaryKey()
          .defaultRandom(),

      storeId:
        uuid("store_id")
          .notNull()
          .unique()
          .references(
            () => stores.id,
            {
              onDelete: "cascade",
            },
          ),

      commissionBps:
        integer("commission_bps")
          .notNull(),

      active:
        boolean("active")
          .notNull()
          .default(true),

      reason:
        text("reason"),

      createdAt:
        timestamp("created_at", {
          withTimezone: true,
        })
          .notNull()
          .defaultNow(),

      updatedAt:
        timestamp("updated_at", {
          withTimezone: true,
        })
          .notNull()
          .defaultNow(),
    },

    (table) => [
      check(
        "store_commission_range",
        sql`
          ${table.commissionBps} >= 0
          AND
          ${table.commissionBps} <= 10000
        `,
      ),
    ],
  );

export const products =
  pgTable(
    "products",
    {
      id:
        uuid("id")
          .primaryKey()
          .defaultRandom(),

      storeId:
        uuid("store_id")
          .notNull()
          .references(
            () => stores.id,
            {
              onDelete: "cascade",
            },
          ),

      slug:
        varchar("slug", {
          length: 160,
        })
          .notNull(),

      name:
        varchar("name", {
          length: 220,
        })
          .notNull(),

      description:
        text("description")
          .notNull()
          .default(""),

      category:
        varchar("category", {
          length: 120,
        })
          .notNull(),

      status:
        productStatusEnum("status")
          .notNull()
          .default("DRAFT"),

      createdAt:
        timestamp("created_at", {
          withTimezone: true,
        })
          .notNull()
          .defaultNow(),

      updatedAt:
        timestamp("updated_at", {
          withTimezone: true,
        })
          .notNull()
          .defaultNow(),
    },

    (table) => [
      uniqueIndex(
        "products_store_slug_unique",
      ).on(
        table.storeId,
        table.slug,
      ),
    ],
  );

export const productVariants =
  pgTable(
    "product_variants",
    {
      id:
        uuid("id")
          .primaryKey()
          .defaultRandom(),

      productId:
        uuid("product_id")
          .notNull()
          .references(
            () => products.id,
            {
              onDelete: "cascade",
            },
          ),

      sku:
        varchar("sku", {
          length: 100,
        })
          .notNull()
          .unique(),

      name:
        varchar("name", {
          length: 160,
        })
          .notNull(),

      priceRial:
        bigint(
          "price_rial",
          {
            mode: "number",
          },
        )
          .notNull(),

      isDefault:
        boolean("is_default")
          .notNull()
          .default(false),

      status:
        variantStatusEnum("status")
          .notNull()
          .default("ACTIVE"),

      createdAt:
        timestamp("created_at", {
          withTimezone: true,
        })
          .notNull()
          .defaultNow(),

      updatedAt:
        timestamp("updated_at", {
          withTimezone: true,
        })
          .notNull()
          .defaultNow(),
    },
  );

export const inventory =
  pgTable(
    "inventory",
    {
      id:
        uuid("id")
          .primaryKey()
          .defaultRandom(),

      variantId:
        uuid("variant_id")
          .notNull()
          .unique()
          .references(
            () => productVariants.id,
            {
              onDelete: "cascade",
            },
          ),

      quantityOnHand:
        integer("quantity_on_hand")
          .notNull()
          .default(0),

      quantityReserved:
        integer("quantity_reserved")
          .notNull()
          .default(0),

      updatedAt:
        timestamp("updated_at", {
          withTimezone: true,
        })
          .notNull()
          .defaultNow(),
    },

    (table) => [
      check(
        "inventory_valid",
        sql`
          ${table.quantityOnHand} >= 0
          AND
          ${table.quantityReserved} >= 0
          AND
          ${table.quantityReserved}
          <=
          ${table.quantityOnHand}
        `,
      ),
    ],
  );
// DND_NERDS_ORDER_RESERVATION_V1
import {
  bigint as orderBigint,
  check as orderCheck,
  index as orderIndex,
  integer as orderInteger,
  pgEnum as orderPgEnum,
  pgTable as orderPgTable,
  timestamp as orderTimestamp,
  uniqueIndex as orderUniqueIndex,
  uuid as orderUuid,
  varchar as orderVarchar,
} from "drizzle-orm/pg-core";

import {
  sql as orderSql,
} from "drizzle-orm";

export const marketplaceOrderStatus =
  orderPgEnum(
    "marketplace_order_status",
    [
      "PENDING_PAYMENT",
      "PAID",
      "CANCELLED",
      "EXPIRED",
      "REFUNDED",
    ],
  );

export const sellerOrderStatus =
  orderPgEnum(
    "seller_order_status",
    [
      "PENDING_PAYMENT",
      "PAID",
      "PROCESSING",
      "SHIPPED",
      "DELIVERED",
      "CANCELLED",
      "REFUNDED",
    ],
  );

export const reservationStatus =
  orderPgEnum(
    "inventory_reservation_status",
    [
      "ACTIVE",
      "CONSUMED",
      "RELEASED",
      "EXPIRED",
    ],
  );

export const marketplaceOrders =
  orderPgTable(
    "marketplace_orders",
    {
      id:
        orderUuid("id")
          .defaultRandom()
          .primaryKey(),

      userId:
        orderUuid("user_id")
          .references(
            () => users.id,
            {
              onDelete:
                "set null",
            },
          ),

      idempotencyKey:
        orderVarchar(
          "idempotency_key",
          {
            length: 128,
          },
        )
          .notNull(),

      requestHash:
        orderVarchar(
          "request_hash",
          {
            length: 64,
          },
        ),

      status:
        marketplaceOrderStatus(
          "status",
        )
          .notNull()
          .default(
            "PENDING_PAYMENT",
          ),

      currency:
        orderVarchar(
          "currency",
          {
            length: 3,
          },
        )
          .notNull()
          .default("IRR"),

      customerTotalRial:
        orderBigint(
          "customer_total_rial",
          {
            mode: "number",
          },
        )
          .notNull(),

      platformCommissionRial:
        orderBigint(
          "platform_commission_rial",
          {
            mode: "number",
          },
        )
          .notNull(),

      sellerNetRial:
        orderBigint(
          "seller_net_rial",
          {
            mode: "number",
          },
        )
          .notNull(),

      expiresAt:
        orderTimestamp(
          "expires_at",
          {
            withTimezone: true,
          },
        )
          .notNull(),

      createdAt:
        orderTimestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      updatedAt:
        orderTimestamp(
          "updated_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      orderUniqueIndex(
        "marketplace_orders_idempotency_key_uq",
      ).on(
        table.idempotencyKey,
      ),

      orderIndex(
        "marketplace_orders_user_id_idx",
      ).on(
        table.userId,
      ),

      orderIndex(
        "marketplace_orders_status_idx",
      ).on(
        table.status,
      ),

      orderCheck(
        "marketplace_orders_customer_total_nonnegative",
        orderSql`${table.customerTotalRial} >= 0`,
      ),

      orderCheck(
        "marketplace_orders_platform_commission_nonnegative",
        orderSql`${table.platformCommissionRial} >= 0`,
      ),

      orderCheck(
        "marketplace_orders_seller_net_nonnegative",
        orderSql`${table.sellerNetRial} >= 0`,
      ),
    ],
  );

export const marketplaceSellerOrders =
  orderPgTable(
    "marketplace_seller_orders",
    {
      id:
        orderUuid("id")
          .defaultRandom()
          .primaryKey(),

      orderId:
        orderUuid("order_id")
          .notNull()
          .references(
            () => marketplaceOrders.id,
            {
              onDelete:
                "cascade",
            },
          ),

      storeId:
        orderUuid("store_id")
          .notNull()
          .references(
            () => stores.id,
            {
              onDelete:
                "restrict",
            },
          ),

      status:
        sellerOrderStatus(
          "status",
        )
          .notNull()
          .default(
            "PENDING_PAYMENT",
          ),

      currency:
        orderVarchar(
          "currency",
          {
            length: 3,
          },
        )
          .notNull()
          .default("IRR"),

      grossRial:
        orderBigint(
          "gross_rial",
          {
            mode: "number",
          },
        )
          .notNull(),

      commissionBpsSnapshot:
        orderInteger(
          "commission_bps_snapshot",
        )
          .notNull(),

      platformCommissionRial:
        orderBigint(
          "platform_commission_rial",
          {
            mode: "number",
          },
        )
          .notNull(),

      sellerNetRial:
        orderBigint(
          "seller_net_rial",
          {
            mode: "number",
          },
        )
          .notNull(),

      createdAt:
        orderTimestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      updatedAt:
        orderTimestamp(
          "updated_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      orderUniqueIndex(
        "marketplace_seller_orders_order_store_uq",
      ).on(
        table.orderId,
        table.storeId,
      ),

      orderIndex(
        "marketplace_seller_orders_store_id_idx",
      ).on(
        table.storeId,
      ),

      orderIndex(
        "marketplace_seller_orders_status_idx",
      ).on(
        table.status,
      ),

      orderCheck(
        "marketplace_seller_orders_commission_bps_range",
        orderSql`${table.commissionBpsSnapshot} >= 0 AND ${table.commissionBpsSnapshot} <= 10000`,
      ),

      orderCheck(
        "marketplace_seller_orders_gross_nonnegative",
        orderSql`${table.grossRial} >= 0`,
      ),

      orderCheck(
        "marketplace_seller_orders_commission_nonnegative",
        orderSql`${table.platformCommissionRial} >= 0`,
      ),

      orderCheck(
        "marketplace_seller_orders_net_nonnegative",
        orderSql`${table.sellerNetRial} >= 0`,
      ),
    ],
  );

export const marketplaceOrderItems =
  orderPgTable(
    "marketplace_order_items",
    {
      id:
        orderUuid("id")
          .defaultRandom()
          .primaryKey(),

      orderId:
        orderUuid("order_id")
          .notNull()
          .references(
            () => marketplaceOrders.id,
            {
              onDelete:
                "cascade",
            },
          ),

      sellerOrderId:
        orderUuid(
          "seller_order_id",
        )
          .notNull()
          .references(
            () => marketplaceSellerOrders.id,
            {
              onDelete:
                "cascade",
            },
          ),

      storeId:
        orderUuid("store_id")
          .notNull()
          .references(
            () => stores.id,
            {
              onDelete:
                "restrict",
            },
          ),

      productId:
        orderUuid("product_id")
          .notNull()
          .references(
            () => products.id,
            {
              onDelete:
                "restrict",
            },
          ),

      variantId:
        orderUuid("variant_id")
          .notNull()
          .references(
            () => productVariants.id,
            {
              onDelete:
                "restrict",
            },
          ),

      productNameSnapshot:
        orderVarchar(
          "product_name_snapshot",
          {
            length: 240,
          },
        )
          .notNull(),

      productSlugSnapshot:
        orderVarchar(
          "product_slug_snapshot",
          {
            length: 240,
          },
        )
          .notNull(),

      variantNameSnapshot:
        orderVarchar(
          "variant_name_snapshot",
          {
            length: 240,
          },
        )
          .notNull(),

      skuSnapshot:
        orderVarchar(
          "sku_snapshot",
          {
            length: 240,
          },
        )
          .notNull(),

      quantity:
        orderInteger(
          "quantity",
        )
          .notNull(),

      unitPriceRial:
        orderBigint(
          "unit_price_rial",
          {
            mode: "number",
          },
        )
          .notNull(),

      lineTotalRial:
        orderBigint(
          "line_total_rial",
          {
            mode: "number",
          },
        )
          .notNull(),

      commissionBpsSnapshot:
        orderInteger(
          "commission_bps_snapshot",
        )
          .notNull(),

      commissionRial:
        orderBigint(
          "commission_rial",
          {
            mode: "number",
          },
        )
          .notNull(),

      sellerNetRial:
        orderBigint(
          "seller_net_rial",
          {
            mode: "number",
          },
        )
          .notNull(),

      createdAt:
        orderTimestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      orderIndex(
        "marketplace_order_items_order_id_idx",
      ).on(
        table.orderId,
      ),

      orderIndex(
        "marketplace_order_items_seller_order_id_idx",
      ).on(
        table.sellerOrderId,
      ),

      orderIndex(
        "marketplace_order_items_product_id_idx",
      ).on(
        table.productId,
      ),

      orderCheck(
        "marketplace_order_items_quantity_positive",
        orderSql`${table.quantity} > 0`,
      ),

      orderCheck(
        "marketplace_order_items_unit_price_nonnegative",
        orderSql`${table.unitPriceRial} >= 0`,
      ),

      orderCheck(
        "marketplace_order_items_line_total_nonnegative",
        orderSql`${table.lineTotalRial} >= 0`,
      ),

      orderCheck(
        "marketplace_order_items_commission_bps_range",
        orderSql`${table.commissionBpsSnapshot} >= 0 AND ${table.commissionBpsSnapshot} <= 10000`,
      ),
    ],
  );

export const inventoryReservations =
  orderPgTable(
    "inventory_reservations",
    {
      id:
        orderUuid("id")
          .defaultRandom()
          .primaryKey(),

      orderId:
        orderUuid("order_id")
          .notNull()
          .references(
            () => marketplaceOrders.id,
            {
              onDelete:
                "cascade",
            },
          ),

      orderItemId:
        orderUuid(
          "order_item_id",
        )
          .notNull()
          .references(
            () => marketplaceOrderItems.id,
            {
              onDelete:
                "cascade",
            },
          ),

      variantId:
        orderUuid("variant_id")
          .notNull()
          .references(
            () => productVariants.id,
            {
              onDelete:
                "restrict",
            },
          ),

      quantity:
        orderInteger(
          "quantity",
        )
          .notNull(),

      status:
        reservationStatus(
          "status",
        )
          .notNull()
          .default("ACTIVE"),

      expiresAt:
        orderTimestamp(
          "expires_at",
          {
            withTimezone: true,
          },
        )
          .notNull(),

      releasedAt:
        orderTimestamp(
          "released_at",
          {
            withTimezone: true,
          },
        ),

      createdAt:
        orderTimestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      orderUniqueIndex(
        "inventory_reservations_order_item_uq",
      ).on(
        table.orderItemId,
      ),

      orderIndex(
        "inventory_reservations_order_id_idx",
      ).on(
        table.orderId,
      ),

      orderIndex(
        "inventory_reservations_variant_id_idx",
      ).on(
        table.variantId,
      ),

      orderIndex(
        "inventory_reservations_status_expires_idx",
      ).on(
        table.status,
        table.expiresAt,
      ),

      orderCheck(
        "inventory_reservations_quantity_positive",
        orderSql`${table.quantity} > 0`,
      ),
    ],
  );
// DND_NERDS_PHASE_BC_AUTH_CHECKOUT_V1
import {
  index as bcIndex,
  pgTable as bcPgTable,
  timestamp as bcTimestamp,
  uniqueIndex as bcUniqueIndex,
  uuid as bcUuid,
  varchar as bcVarchar,
} from "drizzle-orm/pg-core";

export const userSessions =
  bcPgTable(
    "user_sessions",
    {
      id:
        bcUuid("id")
          .defaultRandom()
          .primaryKey(),

      userId:
        bcUuid("user_id")
          .notNull()
          .references(
            () => users.id,
            {
              onDelete:
                "cascade",
            },
          ),

      tokenHash:
        bcVarchar(
          "token_hash",
          {
            length: 64,
          },
        )
          .notNull(),

      expiresAt:
        bcTimestamp(
          "expires_at",
          {
            withTimezone: true,
          },
        )
          .notNull(),

      revokedAt:
        bcTimestamp(
          "revoked_at",
          {
            withTimezone: true,
          },
        ),

      lastSeenAt:
        bcTimestamp(
          "last_seen_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      createdAt:
        bcTimestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      bcUniqueIndex(
        "user_sessions_token_hash_uq",
      ).on(
        table.tokenHash,
      ),

      bcIndex(
        "user_sessions_user_id_idx",
      ).on(
        table.userId,
      ),

      bcIndex(
        "user_sessions_expires_at_idx",
      ).on(
        table.expiresAt,
      ),
    ],
  );

export const marketplaceOrderAddresses =
  bcPgTable(
    "marketplace_order_addresses",
    {
      id:
        bcUuid("id")
          .defaultRandom()
          .primaryKey(),

      orderId:
        bcUuid("order_id")
          .notNull()
          .references(
            () => marketplaceOrders.id,
            {
              onDelete:
                "cascade",
            },
          ),

      fullName:
        bcVarchar(
          "full_name",
          {
            length: 160,
          },
        )
          .notNull(),

      phone:
        bcVarchar(
          "phone",
          {
            length: 32,
          },
        )
          .notNull(),

      countryCode:
        bcVarchar(
          "country_code",
          {
            length: 2,
          },
        )
          .notNull()
          .default("IR"),

      province:
        bcVarchar(
          "province",
          {
            length: 120,
          },
        )
          .notNull(),

      city:
        bcVarchar(
          "city",
          {
            length: 120,
          },
        )
          .notNull(),

      addressLine1:
        bcVarchar(
          "address_line_1",
          {
            length: 360,
          },
        )
          .notNull(),

      addressLine2:
        bcVarchar(
          "address_line_2",
          {
            length: 360,
          },
        ),

      postalCode:
        bcVarchar(
          "postal_code",
          {
            length: 32,
          },
        )
          .notNull(),

      createdAt:
        bcTimestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      bcUniqueIndex(
        "marketplace_order_addresses_order_id_uq",
      ).on(
        table.orderId,
      ),
    ],
  );
// DND_NERDS_PHASE_DE_PAYMENT_LEDGER_V1
import {
  index as deIndex,
  integer as deInteger,
  pgEnum as dePgEnum,
  pgTable as dePgTable,
  primaryKey as dePrimaryKey,
  timestamp as deTimestamp,
  uniqueIndex as deUniqueIndex,
  uuid as deUuid,
  varchar as deVarchar,
} from "drizzle-orm/pg-core";

export const paymentIntentStatusEnum =
  dePgEnum(
    "payment_intent_status",
    [
      "REQUIRES_PAYMENT",
      "PROCESSING",
      "SUCCEEDED",
      "FAILED",
      "CANCELLED",
      "EXPIRED",
    ],
  );

export const paymentStatusEnum =
  dePgEnum(
    "payment_status",
    [
      "SUCCEEDED",
      "PARTIALLY_REFUNDED",
      "REFUNDED",
    ],
  );

export const refundStatusEnum =
  dePgEnum(
    "refund_status",
    [
      "PENDING",
      "SUCCEEDED",
      "FAILED",
    ],
  );

export const ledgerTransactionKindEnum =
  dePgEnum(
    "ledger_transaction_kind",
    [
      "PAYMENT_CAPTURE",
      "REFUND",
      "PAYOUT",
    ],
  );

export const paymentIntents =
  dePgTable(
    "payment_intents",
    {
      id:
        deUuid("id")
          .defaultRandom()
          .primaryKey(),

      orderId:
        deUuid("order_id")
          .notNull()
          .references(
            () => marketplaceOrders.id,
            {
              onDelete:
                "cascade",
            },
          ),

      provider:
        deVarchar(
          "provider",
          {
            length: 40,
          },
        )
          .notNull(),

      providerIntentId:
        deVarchar(
          "provider_intent_id",
          {
            length: 160,
          },
        ),

      status:
        paymentIntentStatusEnum(
          "status",
        )
          .notNull()
          .default(
            "REQUIRES_PAYMENT",
          ),

      amountRial:
        deInteger(
          "amount_rial",
        )
          .notNull(),

      currency:
        deVarchar(
          "currency",
          {
            length: 3,
          },
        )
          .notNull()
          .default("IRR"),

      idempotencyKey:
        deVarchar(
          "idempotency_key",
          {
            length: 128,
          },
        )
          .notNull(),

      expiresAt:
        deTimestamp(
          "expires_at",
          {
            withTimezone: true,
          },
        )
          .notNull(),

      lastErrorCode:
        deVarchar(
          "last_error_code",
          {
            length: 100,
          },
        ),

      succeededAt:
        deTimestamp(
          "succeeded_at",
          {
            withTimezone: true,
          },
        ),

      failedAt:
        deTimestamp(
          "failed_at",
          {
            withTimezone: true,
          },
        ),

      createdAt:
        deTimestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      updatedAt:
        deTimestamp(
          "updated_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      deUniqueIndex(
        "payment_intents_order_id_uq",
      ).on(
        table.orderId,
      ),

      deUniqueIndex(
        "payment_intents_provider_intent_id_uq",
      ).on(
        table.providerIntentId,
      ),

      deUniqueIndex(
        "payment_intents_idempotency_key_uq",
      ).on(
        table.idempotencyKey,
      ),

      deIndex(
        "payment_intents_status_expires_at_idx",
      ).on(
        table.status,
        table.expiresAt,
      ),
    ],
  );

export const paymentWebhookEvents =
  dePgTable(
    "payment_webhook_events",
    {
      id:
        deUuid("id")
          .defaultRandom()
          .primaryKey(),

      provider:
        deVarchar(
          "provider",
          {
            length: 40,
          },
        )
          .notNull(),

      providerEventId:
        deVarchar(
          "provider_event_id",
          {
            length: 180,
          },
        )
          .notNull(),

      eventType:
        deVarchar(
          "event_type",
          {
            length: 80,
          },
        )
          .notNull(),

      payloadHash:
        deVarchar(
          "payload_hash",
          {
            length: 64,
          },
        )
          .notNull(),

      receivedAt:
        deTimestamp(
          "received_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      processedAt:
        deTimestamp(
          "processed_at",
          {
            withTimezone: true,
          },
        ),
    },
    (table) => [
      deUniqueIndex(
        "payment_webhook_events_provider_event_id_uq",
      ).on(
        table.provider,
        table.providerEventId,
      ),
    ],
  );

export const payments =
  dePgTable(
    "payments",
    {
      id:
        deUuid("id")
          .defaultRandom()
          .primaryKey(),

      orderId:
        deUuid("order_id")
          .notNull()
          .references(
            () => marketplaceOrders.id,
            {
              onDelete:
                "cascade",
            },
          ),

      paymentIntentId:
        deUuid(
          "payment_intent_id",
        )
          .notNull()
          .references(
            () => paymentIntents.id,
            {
              onDelete:
                "restrict",
            },
          ),

      provider:
        deVarchar(
          "provider",
          {
            length: 40,
          },
        )
          .notNull(),

      providerPaymentId:
        deVarchar(
          "provider_payment_id",
          {
            length: 180,
          },
        )
          .notNull(),

      amountRial:
        deInteger(
          "amount_rial",
        )
          .notNull(),

      refundedRial:
        deInteger(
          "refunded_rial",
        )
          .notNull()
          .default(0),

      currency:
        deVarchar(
          "currency",
          {
            length: 3,
          },
        )
          .notNull()
          .default("IRR"),

      status:
        paymentStatusEnum(
          "status",
        )
          .notNull(),

      paidAt:
        deTimestamp(
          "paid_at",
          {
            withTimezone: true,
          },
        )
          .notNull(),

      createdAt:
        deTimestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      updatedAt:
        deTimestamp(
          "updated_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      deUniqueIndex(
        "payments_order_id_uq",
      ).on(
        table.orderId,
      ),

      deUniqueIndex(
        "payments_payment_intent_id_uq",
      ).on(
        table.paymentIntentId,
      ),

      deUniqueIndex(
        "payments_provider_payment_id_uq",
      ).on(
        table.provider,
        table.providerPaymentId,
      ),
    ],
  );

export const refunds =
  dePgTable(
    "refunds",
    {
      id:
        deUuid("id")
          .defaultRandom()
          .primaryKey(),

      orderId:
        deUuid("order_id")
          .notNull()
          .references(
            () => marketplaceOrders.id,
            {
              onDelete:
                "cascade",
            },
          ),

      paymentId:
        deUuid(
          "payment_id",
        )
          .notNull()
          .references(
            () => payments.id,
            {
              onDelete:
                "cascade",
            },
          ),

      provider:
        deVarchar(
          "provider",
          {
            length: 40,
          },
        )
          .notNull(),

      providerRefundId:
        deVarchar(
          "provider_refund_id",
          {
            length: 180,
          },
        ),

      idempotencyKey:
        deVarchar(
          "idempotency_key",
          {
            length: 128,
          },
        )
          .notNull(),

      amountRial:
        deInteger(
          "amount_rial",
        )
          .notNull(),

      currency:
        deVarchar(
          "currency",
          {
            length: 3,
          },
        )
          .notNull()
          .default("IRR"),

      status:
        refundStatusEnum(
          "status",
        )
          .notNull(),

      reason:
        deVarchar(
          "reason",
          {
            length: 300,
          },
        )
          .notNull(),

      succeededAt:
        deTimestamp(
          "succeeded_at",
          {
            withTimezone: true,
          },
        ),

      failedAt:
        deTimestamp(
          "failed_at",
          {
            withTimezone: true,
          },
        ),

      createdAt:
        deTimestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      updatedAt:
        deTimestamp(
          "updated_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      deUniqueIndex(
        "refunds_idempotency_key_uq",
      ).on(
        table.idempotencyKey,
      ),

      deUniqueIndex(
        "refunds_provider_refund_id_uq",
      ).on(
        table.provider,
        table.providerRefundId,
      ),

      deIndex(
        "refunds_order_id_idx",
      ).on(
        table.orderId,
      ),
    ],
  );

export const sellerBalances =
  dePgTable(
    "seller_balances",
    {
      storeId:
        deUuid(
          "store_id",
        )
          .notNull()
          .references(
            () => stores.id,
            {
              onDelete:
                "cascade",
            },
          ),

      pendingRial:
        deInteger(
          "pending_rial",
        )
          .notNull()
          .default(0),

      availableRial:
        deInteger(
          "available_rial",
        )
          .notNull()
          .default(0),

      negativeRial:
        deInteger(
          "negative_rial",
        )
          .notNull()
          .default(0),

      paidOutRial:
        deInteger(
          "paid_out_rial",
        )
          .notNull()
          .default(0),

      updatedAt:
        deTimestamp(
          "updated_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      dePrimaryKey({
        columns: [
          table.storeId,
        ],
      }),
    ],
  );

export const financialLedgerTransactions =
  dePgTable(
    "financial_ledger_transactions",
    {
      id:
        deUuid("id")
          .defaultRandom()
          .primaryKey(),

      kind:
        ledgerTransactionKindEnum(
          "kind",
        )
          .notNull(),

      orderId:
        deUuid("order_id")
          .references(
            () => marketplaceOrders.id,
            {
              onDelete:
                "cascade",
            },
          ),

      paymentId:
        deUuid(
          "payment_id",
        )
          .references(
            () => payments.id,
            {
              onDelete:
                "cascade",
            },
          ),

      refundId:
        deUuid(
          "refund_id",
        )
          .references(
            () => refunds.id,
            {
              onDelete:
                "cascade",
            },
          ),

      idempotencyKey:
        deVarchar(
          "idempotency_key",
          {
            length: 160,
          },
        )
          .notNull(),

      createdAt:
        deTimestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      deUniqueIndex(
        "financial_ledger_transactions_idempotency_key_uq",
      ).on(
        table.idempotencyKey,
      ),

      deIndex(
        "financial_ledger_transactions_order_id_idx",
      ).on(
        table.orderId,
      ),
    ],
  );

export const financialLedgerPostings =
  dePgTable(
    "financial_ledger_postings",
    {
      id:
        deUuid("id")
          .defaultRandom()
          .primaryKey(),

      transactionId:
        deUuid(
          "transaction_id",
        )
          .notNull()
          .references(
            () => financialLedgerTransactions.id,
            {
              onDelete:
                "cascade",
            },
          ),

      accountCode:
        deVarchar(
          "account_code",
          {
            length: 80,
          },
        )
          .notNull(),

      storeId:
        deUuid(
          "store_id",
        )
          .references(
            () => stores.id,
            {
              onDelete:
                "restrict",
            },
          ),

      amountRial:
        deInteger(
          "amount_rial",
        )
          .notNull(),

      createdAt:
        deTimestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      deIndex(
        "financial_ledger_postings_transaction_id_idx",
      ).on(
        table.transactionId,
      ),

      deIndex(
        "financial_ledger_postings_store_id_idx",
      ).on(
        table.storeId,
      ),
    ],
  );
// DND_NERDS_PHASE_FG_SELLER_ADMIN_V1
import {
  boolean as fgBoolean,
  index as fgIndex,
  pgEnum as fgPgEnum,
  pgTable as fgPgTable,
  primaryKey as fgPrimaryKey,
  timestamp as fgTimestamp,
  uniqueIndex as fgUniqueIndex,
  uuid as fgUuid,
  varchar as fgVarchar,
} from "drizzle-orm/pg-core";

export const marketplaceAdminRoleEnum =
  fgPgEnum("marketplace_admin_role", [
    "SUPER_ADMIN",
    "MARKETPLACE_ADMIN",
    "SUPPORT",
  ]);

export const marketplaceShipmentStatusEnum =
  fgPgEnum("marketplace_shipment_status", [
    "READY",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
  ]);

export const marketplaceAdmins =
  fgPgTable(
    "marketplace_admins",
    {
      userId:
        fgUuid("user_id")
          .notNull()
          .references(() => users.id, { onDelete: "cascade" }),
      role:
        marketplaceAdminRoleEnum("role").notNull(),
      active:
        fgBoolean("active").notNull().default(true),
      createdAt:
        fgTimestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt:
        fgTimestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      fgPrimaryKey({ columns: [table.userId] }),
    ],
  );

export const marketplaceAdminAuditLogs =
  fgPgTable(
    "marketplace_admin_audit_logs",
    {
      id:
        fgUuid("id").defaultRandom().primaryKey(),
      adminUserId:
        fgUuid("admin_user_id")
          .notNull()
          .references(() => users.id, { onDelete: "restrict" }),
      action:
        fgVarchar("action", { length: 120 }).notNull(),
      entityType:
        fgVarchar("entity_type", { length: 80 }).notNull(),
      entityId:
        fgVarchar("entity_id", { length: 180 }).notNull(),
      details:
        fgVarchar("details", { length: 1800 }),
      createdAt:
        fgTimestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      fgIndex("marketplace_admin_audit_logs_admin_idx").on(table.adminUserId),
      fgIndex("marketplace_admin_audit_logs_entity_idx").on(table.entityType, table.entityId),
    ],
  );

export const marketplaceShipments =
  fgPgTable(
    "marketplace_shipments",
    {
      id:
        fgUuid("id").defaultRandom().primaryKey(),
      sellerOrderId:
        fgUuid("seller_order_id")
          .notNull()
          .references(() => marketplaceSellerOrders.id, { onDelete: "cascade" }),
      storeId:
        fgUuid("store_id")
          .notNull()
          .references(() => stores.id, { onDelete: "restrict" }),
      carrier:
        fgVarchar("carrier", { length: 120 }),
      trackingCode:
        fgVarchar("tracking_code", { length: 160 }),
      status:
        marketplaceShipmentStatusEnum("status").notNull().default("READY"),
      shippedAt:
        fgTimestamp("shipped_at", { withTimezone: true }),
      deliveredAt:
        fgTimestamp("delivered_at", { withTimezone: true }),
      createdAt:
        fgTimestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt:
        fgTimestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
      fgUniqueIndex("marketplace_shipments_seller_order_id_uq").on(table.sellerOrderId),
      fgIndex("marketplace_shipments_store_id_idx").on(table.storeId),
    ],
  );
// DND_NERDS_PHASE_H_SECURITY_MFA_PAYOUT_V1
import {
  boolean as hBoolean,
  index as hIndex,
  integer as hInteger,
  pgEnum as hPgEnum,
  pgTable as hPgTable,
  primaryKey as hPrimaryKey,
  timestamp as hTimestamp,
  uniqueIndex as hUniqueIndex,
  uuid as hUuid,
  varchar as hVarchar,
} from "drizzle-orm/pg-core";

export const sellerPayoutStatusEnum =
  hPgEnum(
    "seller_payout_status",
    [
      "REQUESTED",
      "APPROVED",
      "PROCESSING",
      "REJECTED",
      "PAID",
    ],
  );

export const userTotpMfa =
  hPgTable(
    "user_totp_mfa",
    {
      userId:
        hUuid("user_id")
          .notNull()
          .references(
            () => users.id,
            {
              onDelete:
                "cascade",
            },
          ),

      encryptedSecret:
        hVarchar(
          "encrypted_secret",
          {
            length: 700,
          },
        )
          .notNull(),

      enabled:
        hBoolean("enabled")
          .notNull()
          .default(false),

      confirmedAt:
        hTimestamp(
          "confirmed_at",
          {
            withTimezone: true,
          },
        ),

      createdAt:
        hTimestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      updatedAt:
        hTimestamp(
          "updated_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      hPrimaryKey({
        columns: [
          table.userId,
        ],
      }),
    ],
  );

export const sellerPayoutRequests =
  hPgTable(
    "seller_payout_requests",
    {
      id:
        hUuid("id")
          .defaultRandom()
          .primaryKey(),

      storeId:
        hUuid("store_id")
          .notNull()
          .references(
            () => stores.id,
            {
              onDelete:
                "cascade",
            },
          ),

      requestedByUserId:
        hUuid("requested_by_user_id")
          .notNull()
          .references(
            () => users.id,
            {
              onDelete:
                "restrict",
            },
          ),

      amountRial:
        hInteger("amount_rial")
          .notNull(),

      currency:
        hVarchar(
          "currency",
          {
            length: 3,
          },
        )
          .notNull()
          .default("IRR"),

      status:
        sellerPayoutStatusEnum(
          "status",
        )
          .notNull()
          .default("REQUESTED"),

      reviewedByAdminUserId:
        hUuid(
          "reviewed_by_admin_user_id",
        )
          .references(
            () => users.id,
            {
              onDelete:
                "restrict",
            },
          ),

      reviewReason:
        hVarchar(
          "review_reason",
          {
            length: 500,
          },
        ),

      payoutReference:
        hVarchar(
          "payout_reference",
          {
            length: 220,
          },
        ),

      requestedAt:
        hTimestamp(
          "requested_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      reviewedAt:
        hTimestamp(
          "reviewed_at",
          {
            withTimezone: true,
          },
        ),

      paidAt:
        hTimestamp(
          "paid_at",
          {
            withTimezone: true,
          },
        ),

      updatedAt:
        hTimestamp(
          "updated_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      hIndex(
        "seller_payout_requests_store_idx",
      ).on(
        table.storeId,
      ),

      hIndex(
        "seller_payout_requests_status_idx",
      ).on(
        table.status,
      ),

      hUniqueIndex(
        "seller_payout_requests_reference_uq",
      ).on(
        table.payoutReference,
      ),
    ],
  );
// DND_NERDS_PHASE_I_REDIS_ACCOUNT_SESSIONS_V1
import {
  index as iIndex,
  pgEnum as iPgEnum,
  pgTable as iPgTable,
  primaryKey as iPrimaryKey,
  timestamp as iTimestamp,
  uniqueIndex as iUniqueIndex,
  uuid as iUuid,
  varchar as iVarchar,
} from "drizzle-orm/pg-core";

export const emailActionTypeEnum =
  iPgEnum(
    "email_action_type",
    [
      "VERIFY_EMAIL",
      "PASSWORD_RESET",
    ],
  );

export const payoutProviderAttemptStatusEnum =
  iPgEnum(
    "payout_provider_attempt_status",
    [
      "CREATED",
      "PROCESSING",
      "SUCCEEDED",
      "FAILED",
    ],
  );

export const userSessionDevices =
  iPgTable(
    "user_session_devices",
    {
      sessionId:
        iUuid("session_id")
          .notNull()
          .references(
            () => userSessions.id,
            {
              onDelete:
                "cascade",
            },
          ),

      userAgent:
        iVarchar(
          "user_agent",
          {
            length: 500,
          },
        ),

      ipAddress:
        iVarchar(
          "ip_address",
          {
            length: 80,
          },
        ),

      deviceLabel:
        iVarchar(
          "device_label",
          {
            length: 180,
          },
        ),

      createdAt:
        iTimestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      lastSeenAt:
        iTimestamp(
          "last_seen_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      iPrimaryKey({
        columns: [
          table.sessionId,
        ],
      }),
    ],
  );

export const emailActionTokens =
  iPgTable(
    "email_action_tokens",
    {
      id:
        iUuid("id")
          .defaultRandom()
          .primaryKey(),

      userId:
        iUuid("user_id")
          .notNull()
          .references(
            () => users.id,
            {
              onDelete:
                "cascade",
            },
          ),

      type:
        emailActionTypeEnum(
          "type",
        )
          .notNull(),

      tokenHash:
        iVarchar(
          "token_hash",
          {
            length: 64,
          },
        )
          .notNull(),

      expiresAt:
        iTimestamp(
          "expires_at",
          {
            withTimezone: true,
          },
        )
          .notNull(),

      usedAt:
        iTimestamp(
          "used_at",
          {
            withTimezone: true,
          },
        ),

      createdAt:
        iTimestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      iUniqueIndex(
        "email_action_tokens_hash_uq",
      ).on(
        table.tokenHash,
      ),

      iIndex(
        "email_action_tokens_user_type_idx",
      ).on(
        table.userId,
        table.type,
      ),

      iIndex(
        "email_action_tokens_expiry_idx",
      ).on(
        table.expiresAt,
      ),
    ],
  );

export const payoutProviderAttempts =
  iPgTable(
    "payout_provider_attempts",
    {
      id:
        iUuid("id")
          .defaultRandom()
          .primaryKey(),

      payoutId:
        iUuid("payout_id")
          .notNull()
          .references(
            () => sellerPayoutRequests.id,
            {
              onDelete:
                "cascade",
            },
          ),

      provider:
        iVarchar(
          "provider",
          {
            length: 50,
          },
        )
          .notNull(),

      idempotencyKey:
        iVarchar(
          "idempotency_key",
          {
            length: 180,
          },
        )
          .notNull(),

      status:
        payoutProviderAttemptStatusEnum(
          "status",
        )
          .notNull()
          .default("CREATED"),

      providerReference:
        iVarchar(
          "provider_reference",
          {
            length: 220,
          },
        ),

      failureReason:
        iVarchar(
          "failure_reason",
          {
            length: 500,
          },
        ),

      createdAt:
        iTimestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      updatedAt:
        iTimestamp(
          "updated_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    (table) => [
      iUniqueIndex(
        "payout_provider_attempts_idempotency_uq",
      ).on(
        table.idempotencyKey,
      ),

      iIndex(
        "payout_provider_attempts_payout_idx",
      ).on(
        table.payoutId,
      ),
    ],
  );

// DND_NERDS_PHASE_J2A_PROVIDER_ABSTRACTION_V1
import {
  index as j2aIndex,
  jsonb as j2aJsonb,
  pgTable as j2aPgTable,
  timestamp as j2aTimestamp,
  uniqueIndex as j2aUniqueIndex,
  uuid as j2aUuid,
  varchar as j2aVarchar,
} from "drizzle-orm/pg-core";

export const paymentProviderBindings =
  j2aPgTable(
    "payment_provider_bindings",
    {
      id:
        j2aUuid(
          "id",
        )
          .defaultRandom()
          .primaryKey(),

      paymentIntentId:
        j2aUuid(
          "payment_intent_id",
        )
          .notNull()
          .references(
            () =>
              paymentIntents.id,
            {
              onDelete:
                "cascade",
            },
          ),

      providerKey:
        j2aVarchar(
          "provider_key",
          {
            length:
              64,
          },
        )
          .notNull(),

      providerIntentId:
        j2aVarchar(
          "provider_intent_id",
          {
            length:
              255,
          },
        ),

      providerReference:
        j2aVarchar(
          "provider_reference",
          {
            length:
              255,
          },
        ),

      providerStatus:
        j2aVarchar(
          "provider_status",
          {
            length:
              64,
          },
        ),

      providerMetadata:
        j2aJsonb(
          "provider_metadata",
        )
          .$type<
            Record<
              string,
              unknown
            >
          >()
          .notNull()
          .default({}),

      createdAt:
        j2aTimestamp(
          "created_at",
          {
            withTimezone:
              true,
          },
        )
          .defaultNow()
          .notNull(),

      updatedAt:
        j2aTimestamp(
          "updated_at",
          {
            withTimezone:
              true,
          },
        )
          .defaultNow()
          .notNull(),
    },
    table => [
      j2aUniqueIndex(
        "payment_provider_bindings_payment_intent_uq",
      ).on(
        table.paymentIntentId,
      ),

      j2aIndex(
        "payment_provider_bindings_provider_idx",
      ).on(
        table.providerKey,
      ),
    ],
  );

// DND_NERDS_PHASE_J2M_F1_PAYOUT_DESTINATION_FOUNDATION_V1
import {
  index as j2mfIndex,
  pgEnum as j2mfPgEnum,
  pgTable as j2mfPgTable,
  text as j2mfText,
  timestamp as j2mfTimestamp,
  uuid as j2mfUuid,
  varchar as j2mfVarchar,
} from "drizzle-orm/pg-core";

export const payoutDestinationStatusEnum =
  j2mfPgEnum(
    "payout_destination_status",
    [
      "PENDING_REVIEW",
      "VERIFIED",
      "DISABLED",
      "REJECTED",
    ],
  );

export const sellerPayoutDestinations =
  j2mfPgTable(
    "seller_payout_destinations",
    {
      id:
        j2mfUuid("id")
          .defaultRandom()
          .primaryKey(),

      storeId:
        j2mfUuid("store_id")
          .notNull()
          .references(
            () => stores.id,
            {
              onDelete:
                "cascade",
            },
          ),

      createdByUserId:
        j2mfUuid(
          "created_by_user_id",
        )
          .notNull()
          .references(
            () => users.id,
            {
              onDelete:
                "restrict",
            },
          ),

      method:
        j2mfVarchar(
          "method",
          {
            length: 32,
          },
        )
          .notNull()
          .default("IR_IBAN"),

      ibanCiphertext:
        j2mfText(
          "iban_ciphertext",
        )
          .notNull(),

      ibanIv:
        j2mfVarchar(
          "iban_iv",
          {
            length: 64,
          },
        )
          .notNull(),

      ibanAuthTag:
        j2mfVarchar(
          "iban_auth_tag",
          {
            length: 64,
          },
        )
          .notNull(),

      ibanLast4:
        j2mfVarchar(
          "iban_last4",
          {
            length: 4,
          },
        )
          .notNull(),

      ibanFingerprint:
        j2mfVarchar(
          "iban_fingerprint",
          {
            length: 64,
          },
        )
          .notNull(),

      accountHolderName:
        j2mfVarchar(
          "account_holder_name",
          {
            length: 160,
          },
        )
          .notNull(),

      status:
        payoutDestinationStatusEnum(
          "status",
        )
          .notNull()
          .default(
            "PENDING_REVIEW",
          ),

      reviewedByAdminUserId:
        j2mfUuid(
          "reviewed_by_admin_user_id",
        )
          .references(
            () => users.id,
            {
              onDelete:
                "restrict",
            },
          ),

      reviewReason:
        j2mfVarchar(
          "review_reason",
          {
            length: 500,
          },
        ),

      reviewedAt:
        j2mfTimestamp(
          "reviewed_at",
          {
            withTimezone: true,
          },
        ),

      createdAt:
        j2mfTimestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      updatedAt:
        j2mfTimestamp(
          "updated_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    table => [
      j2mfIndex(
        "seller_payout_destinations_store_idx",
      ).on(
        table.storeId,
      ),

      j2mfIndex(
        "seller_payout_destinations_status_idx",
      ).on(
        table.status,
      ),

      j2mfIndex(
        "seller_payout_destinations_fingerprint_idx",
      ).on(
        table.ibanFingerprint,
      ),
    ],
  );

// DND_NERDS_PHASE_J2M_F2_PAYOUT_DESTINATION_PINNING_V1
import {
  index as j2mf2Index,
  pgTable as j2mf2PgTable,
  text as j2mf2Text,
  timestamp as j2mf2Timestamp,
  uuid as j2mf2Uuid,
  varchar as j2mf2Varchar,
} from "drizzle-orm/pg-core";

export const payoutRequestDestinationSnapshots =
  j2mf2PgTable(
    "payout_request_destination_snapshots",
    {
      payoutId:
        j2mf2Uuid(
          "payout_id",
        )
          .primaryKey()
          .references(
            () =>
              sellerPayoutRequests.id,
            {
              onDelete:
                "cascade",
            },
          ),

      destinationId:
        j2mf2Uuid(
          "destination_id",
        )
          .notNull()
          .references(
            () =>
              sellerPayoutDestinations.id,
            {
              onDelete:
                "restrict",
            },
          ),

      method:
        j2mf2Varchar(
          "method",
          {
            length: 32,
          },
        )
          .notNull(),

      ibanCiphertext:
        j2mf2Text(
          "iban_ciphertext",
        )
          .notNull(),

      ibanIv:
        j2mf2Varchar(
          "iban_iv",
          {
            length: 64,
          },
        )
          .notNull(),

      ibanAuthTag:
        j2mf2Varchar(
          "iban_auth_tag",
          {
            length: 64,
          },
        )
          .notNull(),

      ibanLast4:
        j2mf2Varchar(
          "iban_last4",
          {
            length: 4,
          },
        )
          .notNull(),

      ibanFingerprint:
        j2mf2Varchar(
          "iban_fingerprint",
          {
            length: 64,
          },
        )
          .notNull(),

      accountHolderName:
        j2mf2Varchar(
          "account_holder_name",
          {
            length: 160,
          },
        )
          .notNull(),

      createdAt:
        j2mf2Timestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    table => [
      j2mf2Index(
        "payout_request_destination_snapshots_destination_idx",
      ).on(
        table.destinationId,
      ),
    ],
  );

// DND_NERDS_PHASE_J2N_A_REFUND_CASE_FOUNDATION_V1
import {
  boolean as j2naBoolean,
  index as j2naIndex,
  integer as j2naInteger,
  pgEnum as j2naPgEnum,
  pgTable as j2naPgTable,
  text as j2naText,
  timestamp as j2naTimestamp,
  uuid as j2naUuid,
  varchar as j2naVarchar,
} from "drizzle-orm/pg-core";

export const refundCaseStatusEnum =
  j2naPgEnum(
    "refund_case_status",
    [
      "REQUESTED",
      "EVIDENCE_REQUIRED",
      "CONTACT_REQUIRED",
      "UNDER_REVIEW",
      "SELLER_RESPONSE",
      "RETURN_REQUIRED",
      "APPROVED",
      "REJECTED",
      "REFUND_PROCESSING",
      "REFUNDED",
      "CLOSED",
    ],
  );

export const refundCaseReasonEnum =
  j2naPgEnum(
    "refund_case_reason",
    [
      "DAMAGED",
      "DEFECTIVE",
      "WRONG_ITEM",
      "MISSING_ITEM",
      "NOT_AS_DESCRIBED",
      "OTHER",
    ],
  );

export const marketplaceRefundCases =
  j2naPgTable(
    "marketplace_refund_cases",
    {
      id:
        j2naUuid("id")
          .defaultRandom()
          .primaryKey(),

      orderId:
        j2naUuid("order_id")
          .notNull()
          .references(
            () => marketplaceOrders.id,
            {
              onDelete:
                "restrict",
            },
          ),

      sellerOrderId:
        j2naUuid(
          "seller_order_id",
        )
          .notNull()
          .references(
            () => marketplaceSellerOrders.id,
            {
              onDelete:
                "restrict",
            },
          ),

      storeId:
        j2naUuid("store_id")
          .notNull()
          .references(
            () => stores.id,
            {
              onDelete:
                "restrict",
            },
          ),

      buyerUserId:
        j2naUuid(
          "buyer_user_id",
        )
          .notNull()
          .references(
            () => users.id,
            {
              onDelete:
                "restrict",
            },
          ),

      reason:
        refundCaseReasonEnum(
          "reason",
        )
          .notNull(),

      description:
        j2naText(
          "description",
        )
          .notNull(),

      status:
        refundCaseStatusEnum(
          "status",
        )
          .notNull()
          .default(
            "EVIDENCE_REQUIRED",
          ),

      sellerResponse:
        j2naText(
          "seller_response",
        ),

      sellerRespondedByUserId:
        j2naUuid(
          "seller_responded_by_user_id",
        )
          .references(
            () => users.id,
            {
              onDelete:
                "set null",
            },
          ),

      sellerRespondedAt:
        j2naTimestamp(
          "seller_responded_at",
          {
            withTimezone: true,
          },
        ),

      contactConfirmedByAdminUserId:
        j2naUuid(
          "contact_confirmed_by_admin_user_id",
        )
          .references(
            () => users.id,
            {
              onDelete:
                "set null",
            },
          ),

      contactConfirmedAt:
        j2naTimestamp(
          "contact_confirmed_at",
          {
            withTimezone: true,
          },
        ),

      sellerResponseDueAt:
        j2naTimestamp(
          "seller_response_due_at",
          {
            withTimezone: true,
          },
        ),

      decidedByAdminUserId:
        j2naUuid(
          "decided_by_admin_user_id",
        )
          .references(
            () => users.id,
            {
              onDelete:
                "set null",
            },
          ),

      decisionReason:
        j2naText(
          "decision_reason",
        ),

      returnRequired:
        j2naBoolean(
          "return_required",
        )
          .notNull()
          .default(false),

      decidedAt:
        j2naTimestamp(
          "decided_at",
          {
            withTimezone: true,
          },
        ),

      refundAmountRial:
        j2naInteger(
          "refund_amount_rial",
        ),

      commissionReversalRial:
        j2naInteger(
          "commission_reversal_rial",
        ),

      sellerNetReversalRial:
        j2naInteger(
          "seller_net_reversal_rial",
        ),

      financialPlanCreatedAt:
        j2naTimestamp(
          "financial_plan_created_at",
          {
            withTimezone: true,
          },
        ),

      returnReceivedAt:
        j2naTimestamp(
          "return_received_at",
          {
            withTimezone: true,
          },
        ),

      returnReceivedByAdminUserId:
        j2naUuid(
          "return_received_by_admin_user_id",
        )
          .references(
            () => users.id,
            {
              onDelete:
                "set null",
            },
          ),

      returnNote:
        j2naText(
          "return_note",
        ),

      financialRefundId:
        j2naUuid(
          "financial_refund_id",
        ),

      createdAt:
        j2naTimestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),

      updatedAt:
        j2naTimestamp(
          "updated_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    table => [
      j2naIndex(
        "marketplace_refund_cases_order_idx",
      ).on(
        table.orderId,
      ),

      j2naIndex(
        "marketplace_refund_cases_seller_order_idx",
      ).on(
        table.sellerOrderId,
      ),

      j2naIndex(
        "marketplace_refund_cases_store_idx",
      ).on(
        table.storeId,
      ),

      j2naIndex(
        "marketplace_refund_cases_buyer_idx",
      ).on(
        table.buyerUserId,
      ),

      j2naIndex(
        "marketplace_refund_cases_status_idx",
      ).on(
        table.status,
      ),
    ],
  );

export const marketplaceRefundCaseEvidence =
  j2naPgTable(
    "marketplace_refund_case_evidence",
    {
      id:
        j2naUuid("id")
          .defaultRandom()
          .primaryKey(),

      caseId:
        j2naUuid("case_id")
          .notNull()
          .references(
            () => marketplaceRefundCases.id,
            {
              onDelete:
                "cascade",
            },
          ),

      uploadedByUserId:
        j2naUuid(
          "uploaded_by_user_id",
        )
          .notNull()
          .references(
            () => users.id,
            {
              onDelete:
                "restrict",
            },
          ),

      storageKey:
        j2naVarchar(
          "storage_key",
          {
            length: 500,
          },
        )
          .notNull(),

      originalName:
        j2naVarchar(
          "original_name",
          {
            length: 240,
          },
        )
          .notNull(),

      mimeType:
        j2naVarchar(
          "mime_type",
          {
            length: 120,
          },
        )
          .notNull(),

      sizeBytes:
        j2naInteger(
          "size_bytes",
        )
          .notNull(),

      sha256:
        j2naVarchar(
          "sha256",
          {
            length: 64,
          },
        )
          .notNull(),

      createdAt:
        j2naTimestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    table => [
      j2naIndex(
        "marketplace_refund_case_evidence_case_idx",
      ).on(
        table.caseId,
      ),
    ],
  );

export const marketplaceRefundCaseEvents =
  j2naPgTable(
    "marketplace_refund_case_events",
    {
      id:
        j2naUuid("id")
          .defaultRandom()
          .primaryKey(),

      caseId:
        j2naUuid("case_id")
          .notNull()
          .references(
            () => marketplaceRefundCases.id,
            {
              onDelete:
                "cascade",
            },
          ),

      actorUserId:
        j2naUuid(
          "actor_user_id",
        )
          .references(
            () => users.id,
            {
              onDelete:
                "set null",
            },
          ),

      actorRole:
        j2naVarchar(
          "actor_role",
          {
            length: 40,
          },
        )
          .notNull(),

      eventType:
        j2naVarchar(
          "event_type",
          {
            length: 100,
          },
        )
          .notNull(),

      details:
        j2naVarchar(
          "details",
          {
            length: 1800,
          },
        ),

      createdAt:
        j2naTimestamp(
          "created_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
    table => [
      j2naIndex(
        "marketplace_refund_case_events_case_idx",
      ).on(
        table.caseId,
      ),
    ],
  );

export const marketplaceRefundPolicy =
  j2naPgTable(
    "marketplace_refund_policy",
    {
      id:
        j2naVarchar(
          "id",
          {
            length: 32,
          },
        )
          .primaryKey(),

      evidenceRequired:
        j2naBoolean(
          "evidence_required",
        )
          .notNull()
          .default(true),

      minimumEvidenceCount:
        j2naInteger(
          "minimum_evidence_count",
        )
          .notNull()
          .default(1),

      supportContactRequired:
        j2naBoolean(
          "support_contact_required",
        )
          .notNull()
          .default(true),

      sellerResponseHours:
        j2naInteger(
          "seller_response_hours",
        )
          .notNull()
          .default(48),

      autoRefund:
        j2naBoolean(
          "auto_refund",
        )
          .notNull()
          .default(false),

      requestWindowDays:
        j2naInteger(
          "request_window_days",
        ),

      updatedAt:
        j2naTimestamp(
          "updated_at",
          {
            withTimezone: true,
          },
        )
          .notNull()
          .defaultNow(),
    },
  );


// J2O-A: durable, store-scoped notification preferences and transactional outbox.
export const sellerNotificationPreferences = pgTable(
  "seller_notification_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    channel: varchar("channel", { length: 20 }).notNull(),
    enabled: boolean("enabled").notNull(),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("seller_notification_preferences_unique").on(table.storeId, table.eventType, table.channel),
    check("seller_notification_preferences_channel_check", sql`${table.channel} IN ('IN_APP','EMAIL','TELEGRAM','BALE','WEB_PUSH')`),
    check("seller_notification_preferences_event_check", sql`${table.eventType} IN ('SELLER_ORDER_PAID','REFUND_CASE_OPENED','LOW_STOCK','PAYOUT_COMPLETED')`),
  ],
);

export const sellerNotificationOutbox = pgTable(
  "seller_notification_outbox",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "restrict" }),
    sellerOrderId: uuid("seller_order_id").references(() => marketplaceSellerOrders.id, { onDelete: "restrict" }),
    recipientUserId: uuid("recipient_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    channel: varchar("channel", { length: 20 }).notNull(),
    dedupeKey: varchar("dedupe_key", { length: 250 }).notNull(),
    payload: jsonb("payload").$type<Record<string, string | number>>().notNull(),
    status: varchar("status", { length: 24 }).notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    claimToken: uuid("claim_token"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    lastError: varchar("last_error", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("seller_notification_outbox_dedupe_unique").on(table.dedupeKey),
    index("seller_notification_outbox_dispatch_idx").on(table.status, table.channel, table.availableAt),
    index("seller_notification_outbox_recipient_idx").on(table.storeId, table.recipientUserId, table.createdAt),
    check("seller_notification_outbox_status_check", sql`${table.status} IN ('PENDING','PROCESSING','DELIVERED','FAILED')`),
    check("seller_notification_outbox_channel_check", sql`${table.channel} IN ('IN_APP','EMAIL','TELEGRAM','BALE','WEB_PUSH')`),
    check("seller_notification_outbox_attempts_check", sql`${table.attempts} >= 0`),
  ],
);

// J2O-B1: one verified private bot destination per authorized store member/channel.
// The destination is encrypted and never returned by seller APIs.
export const sellerNotificationConnections = pgTable(
  "seller_notification_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    channel: varchar("channel", { length: 20 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("CONNECTED"),
    peerCiphertext: text("peer_ciphertext"),
    peerFingerprint: varchar("peer_fingerprint", { length: 64 }),
    verifiedBy: varchar("verified_by", { length: 40 }),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("seller_notification_connections_unique").on(table.storeId, table.userId, table.channel),
    index("seller_notification_connections_store_idx").on(table.storeId, table.channel),
    check("seller_notification_connections_channel_check", sql`${table.channel} IN ('TELEGRAM','BALE')`),
    check("seller_notification_connections_status_check", sql`${table.status} IN ('CONNECTED','DISCONNECTED')`),
  ],
);

export const sellerNotificationPairingChallenges = pgTable(
  "seller_notification_pairing_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    channel: varchar("channel", { length: 20 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("seller_notification_pairing_token_unique").on(table.tokenHash),
    index("seller_notification_pairing_recipient_idx").on(table.storeId, table.userId, table.channel),
    check("seller_notification_pairing_channel_check", sql`${table.channel} IN ('TELEGRAM','BALE')`),
  ],
);

// Social graph foundation — separate from financial ledgers and seller profiles.
export const socialProfiles = pgTable("social_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  friendCode: varchar("friend_code", { length: 32 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const socialFriendRequests = pgTable("social_friend_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  senderUserId: uuid("sender_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  receiverUserId: uuid("receiver_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 16 }).notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("social_friend_requests_unique_direction").on(table.senderUserId, table.receiverUserId),
  index("social_friend_requests_receiver_status_idx").on(table.receiverUserId, table.status),
  check("social_friend_requests_no_self", sql`${table.senderUserId} <> ${table.receiverUserId}`),
  check("social_friend_requests_status_valid", sql`${table.status} IN ('PENDING','ACCEPTED','DECLINED')`),
]);

export const socialFriendships = pgTable("social_friendships", {
  lowerUserId: uuid("lower_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  upperUserId: uuid("upper_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("social_friendships_unique_pair").on(table.lowerUserId, table.upperUserId),
  index("social_friendships_upper_idx").on(table.upperUserId),
  check("social_friendships_ordered_pair", sql`${table.lowerUserId} < ${table.upperUserId}`),
]);

export const socialBlocks = pgTable("social_blocks", {
  blockerUserId: uuid("blocker_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  blockedUserId: uuid("blocked_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("social_blocks_unique_direction").on(table.blockerUserId, table.blockedUserId),
  index("social_blocks_blocked_idx").on(table.blockedUserId),
  check("social_blocks_no_self", sql`${table.blockerUserId} <> ${table.blockedUserId}`),
]);

export const socialMessages = pgTable("social_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  senderUserId: uuid("sender_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  receiverUserId: uuid("receiver_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: varchar("body", { length: 2000 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("social_messages_sender_idx").on(table.senderUserId, table.createdAt),
  index("social_messages_receiver_idx").on(table.receiverUserId, table.createdAt),
  check("social_messages_no_self", sql`${table.senderUserId} <> ${table.receiverUserId}`),
  check("social_messages_body_length", sql`length(btrim(${table.body})) BETWEEN 1 AND 2000`),
]);

// Private, invitation-only group conversations; separate from direct messages.
export const socialGroups = pgTable("social_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 80 }).notNull(),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const socialGroupMembers = pgTable("social_group_members", {
  groupId: uuid("group_id").notNull().references(() => socialGroups.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("social_group_members_pair_unique").on(t.groupId, t.userId),
  index("social_group_members_user_idx").on(t.userId),
]);

export const socialGroupInvites = pgTable("social_group_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => socialGroups.id, { onDelete: "cascade" }),
  senderUserId: uuid("sender_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  invitedUserId: uuid("invited_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: varchar("status", { length: 16 }).notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
}, t => [
  uniqueIndex("social_group_invites_group_target_unique").on(t.groupId, t.invitedUserId),
  index("social_group_invites_invited_status_idx").on(t.invitedUserId, t.status),
  check("social_group_invites_no_self", sql`${t.senderUserId} <> ${t.invitedUserId}`),
  check("social_group_invites_status_valid", sql`${t.status} IN ('PENDING','ACCEPTED','DECLINED')`),
]);

export const socialGroupMessages = pgTable("social_group_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").notNull().references(() => socialGroups.id, { onDelete: "cascade" }),
  senderUserId: uuid("sender_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: varchar("body", { length: 2000 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("social_group_messages_group_date_idx").on(t.groupId, t.createdAt),
  index("social_group_messages_sender_date_idx").on(t.senderUserId, t.createdAt),
  check("social_group_messages_body_length", sql`length(btrim(${t.body})) BETWEEN 1 AND 2000`),
]);

// The website owns discovery and lobby state. The WebVTT engine is attached later.
export const dmProfiles = pgTable("dm_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  bio: varchar("bio", { length: 1200 }).notNull().default(""),
  playStyle: varchar("play_style", { length: 60 }).notNull().default("داستان‌محور"),
  languages: varchar("languages", { length: 120 }).notNull().default("فارسی"),
  experienceYears: integer("experience_years").notNull().default(0),
  visible: boolean("visible").notNull().default(true),
  avatarData: text("avatar_data"),
  bannerData: text("banner_data"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("dm_profiles_visible_idx").on(t.visible),
  check("dm_profiles_experience_range", sql`${t.experienceYears} BETWEEN 0 AND 60`),
]);

export const playerProfiles = pgTable("player_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  displayName: varchar("display_name", { length: 100 }).notNull(),
  bio: varchar("bio", { length: 1200 }).notNull().default(""),
  avatarData: text("avatar_data"), bannerData: text("banner_data"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const playerCharacters = pgTable("player_characters", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 80 }).notNull(),
  className: varchar("class_name", { length: 60 }).notNull().default(""),
  subclass: varchar("subclass", { length: 80 }).notNull().default(""),
  race: varchar("race", { length: 80 }).notNull().default(""),
  background: varchar("background", { length: 120 }).notNull().default(""),
  level: integer("level").notNull().default(1),
  currentHp: integer("current_hp").notNull().default(1),
  maxHp: integer("max_hp").notNull().default(1),
  description: text("description").notNull().default(""),
  story: text("story").notNull().default(""),
  portraitData: text("portrait_data"),
  public: boolean("public").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("player_characters_user_idx").on(t.userId, t.createdAt),
  check("player_characters_level_range", sql`${t.level} BETWEEN 1 AND 20`),
  check("player_characters_hp_range", sql`${t.maxHp} BETWEEN 1 AND 999 AND ${t.currentHp} BETWEEN 0 AND ${t.maxHp}`),
  check("player_characters_story_length", sql`length(${t.story}) <= 3000`),
  check("player_characters_description_length", sql`length(${t.description}) <= 1200`),
]);

export const gameTables = pgTable("game_tables", {
  id: uuid("id").primaryKey().defaultRandom(),
  hostUserId: uuid("host_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  visibility: varchar("visibility", { length: 8 }).notNull().default("PUBLIC"),
  inviteCodeHash: varchar("invite_code_hash", { length: 64 }),
  title: varchar("title", { length: 120 }).notNull(),
  description: varchar("description", { length: 2000 }).notNull().default(""),
  genres: jsonb("genres").$type<string[]>().notNull().default([]),
  imageData: text("image_data"),
  system: varchar("system", { length: 80 }).notNull().default("D&D 5e"),
  language: varchar("language", { length: 60 }).notNull().default("فارسی"),
  playStyle: varchar("play_style", { length: 60 }).notNull().default("داستان‌محور"),
  levelRange: varchar("level_range", { length: 60 }).notNull().default("۱ تا ۵"),
  schedule: varchar("schedule", { length: 160 }).notNull().default("با هماهنگی گروه"),
  capacity: integer("capacity").notNull().default(4),
  status: varchar("status", { length: 16 }).notNull().default("DRAFT"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("game_tables_status_created_idx").on(t.status, t.createdAt),
  index("game_tables_host_idx").on(t.hostUserId, t.createdAt),
  check("game_tables_capacity_range", sql`${t.capacity} BETWEEN 2 AND 8`),
  check("game_tables_status_valid", sql`${t.status} IN ('DRAFT','PUBLISHED','CLOSED','HIDDEN')`),
  check("game_tables_visibility_valid", sql`${t.visibility} IN ('PUBLIC','PRIVATE')`),
]);

export const gameApplications = pgTable("game_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  tableId: uuid("table_id").notNull().references(() => gameTables.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  note: varchar("note", { length: 500 }).notNull().default(""),
  status: varchar("status", { length: 16 }).notNull().default("PENDING"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("game_applications_table_user_uq").on(t.tableId, t.userId),
  index("game_applications_user_idx").on(t.userId, t.createdAt),
  index("game_applications_table_status_idx").on(t.tableId, t.status),
  check("game_applications_status_valid", sql`${t.status} IN ('PENDING','ACCEPTED','DECLINED','WITHDRAWN')`),
]);

export const gameTableReviews = pgTable("game_table_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  tableId: uuid("table_id").notNull().references(() => gameTables.id, { onDelete: "cascade" }),
  reviewerUserId: uuid("reviewer_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  comment: varchar("comment", { length: 1200 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  uniqueIndex("game_table_reviews_table_reviewer_uq").on(t.tableId, t.reviewerUserId),
  index("game_table_reviews_table_date_idx").on(t.tableId, t.createdAt),
  check("game_table_reviews_rating_range", sql`${t.rating} BETWEEN 1 AND 5`),
  check("game_table_reviews_comment_length", sql`length(btrim(${t.comment})) BETWEEN 10 AND 1200`),
]);

export const arenaListings = pgTable("arena_listings", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerUserId: uuid("owner_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  opponentUserId: uuid("opponent_user_id").references(() => users.id, { onDelete: "set null" }),
  mode: varchar("mode", { length: 4 }).notNull(),
  title: varchar("title", { length: 100 }).notNull(),
  note: varchar("note", { length: 500 }).notNull().default(""),
  status: varchar("status", { length: 16 }).notNull().default("OPEN"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("arena_listings_status_idx").on(t.status, t.createdAt),
  index("arena_listings_owner_idx").on(t.ownerUserId),
  check("arena_listings_mode_valid", sql`${t.mode} IN ('1V1','2V2','3V3')`),
  check("arena_listings_status_valid", sql`${t.status} IN ('OPEN','MATCHED','CANCELLED','HIDDEN')`),
]);

export const sitePosts = pgTable("site_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  authorUserId: uuid("author_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  title: varchar("title", { length: 160 }).notNull(),
  summary: varchar("summary", { length: 500 }).notNull(),
  body: text("body").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("DRAFT"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("site_posts_status_created_idx").on(t.status, t.createdAt),
  check("site_posts_status_valid", sql`${t.status} IN ('DRAFT','PUBLISHED')`),
]);

export const gameSubscriptionGrants = pgTable("game_subscription_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  email: varchar("email", { length: 320 }).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  reason: varchar("reason", { length: 500 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index("game_subscription_grants_user_idx").on(t.userId, t.endsAt),
  index("game_subscription_grants_email_idx").on(t.email, t.endsAt),
  check("game_subscription_grants_period_valid", sql`${t.endsAt} > ${t.startsAt}`),
]);

export const gameSubscriptionSettings = pgTable("game_subscription_settings", {
  id: integer("id").primaryKey(),
  priceRial: integer("price_rial").notNull().default(5990000),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [
  check("game_subscription_settings_singleton", sql`${t.id} = 1`),
  check("game_subscription_settings_price_valid", sql`${t.priceRial} > 0`),
]);
