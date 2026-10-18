import {
  db,
  sqlClient,
} from "./client";

import {
  inventory,
  marketplaceConfig,
  productVariants,
  products,
  sellerProfiles,
  storeCommissionSettings,
  storeMembers,
  stores,
  users,
} from "./schema";

const seedStores = [
  {
    userId:
      "10000000-0000-4000-8000-000000000001",

    sellerId:
      "20000000-0000-4000-8000-000000000001",

    storeId:
      "30000000-0000-4000-8000-000000000001",

    email:
      "dragon-forge@example.local",

    slug:
      "dragon-forge",

    name:
      "Dragon Forge",

    description:
      "دایس، اکسسوری و تجهیزات میز بازی با طراحی فانتزی",

    category:
      "Dice & Accessories",

    verified:
      true,

    rating:
      490,

    reviews:
      128,

    commissionBps:
      400,
  },

  {
    userId:
      "10000000-0000-4000-8000-000000000002",

    sellerId:
      "20000000-0000-4000-8000-000000000002",

    storeId:
      "30000000-0000-4000-8000-000000000002",

    email:
      "mimic-workshop@example.local",

    slug:
      "mimic-workshop",

    name:
      "Mimic Workshop",

    description:
      "Battle Map، Terrain و ابزارهای فیزیکی برای Game Masterها",

    category:
      "Maps & Terrain",

    verified:
      true,

    rating:
      480,

    reviews:
      84,

    commissionBps:
      null,
  },

  {
    userId:
      "10000000-0000-4000-8000-000000000003",

    sellerId:
      "20000000-0000-4000-8000-000000000003",

    storeId:
      "30000000-0000-4000-8000-000000000003",

    email:
      "arcane-miniatures@example.local",

    slug:
      "arcane-miniatures",

    name:
      "Arcane Miniatures",

    description:
      "Miniatureهای فانتزی برای کمپین‌ها و Encounterهای رومیزی",

    category:
      "Miniatures",

    verified:
      true,

    rating:
      470,

    reviews:
      63,

    commissionBps:
      null,
  },

  {
    userId:
      "10000000-0000-4000-8000-000000000004",

    sellerId:
      "20000000-0000-4000-8000-000000000004",

    storeId:
      "30000000-0000-4000-8000-000000000004",

    email:
      "dungeon-supply@example.local",

    slug:
      "dungeon-supply",

    name:
      "Dungeon Supply",

    description:
      "ابزار DM، Token، Notebook و لوازم کاربردی TTRPG",

    category:
      "GM Tools",

    verified:
      false,

    rating:
      460,

    reviews:
      47,

    commissionBps:
      450,
  },
] as const;

const seedProducts = [
  [
    "40000000-0000-4000-8000-000000000001",
    "50000000-0000-4000-8000-000000000001",
    "60000000-0000-4000-8000-000000000001",
    "30000000-0000-4000-8000-000000000001",
    "bloodmoon-dice-set",
    "Bloodmoon Dice Set",
    "ست کامل دایس رزینی با تم قرمز تیره و طلایی",
    "Dice",
    "DF-BLOODMOON-001",
    14500000,
    14,
  ],

  [
    "40000000-0000-4000-8000-000000000002",
    "50000000-0000-4000-8000-000000000002",
    "60000000-0000-4000-8000-000000000002",
    "30000000-0000-4000-8000-000000000001",
    "ancient-dice-tower",
    "Ancient Dice Tower",
    "Dice Tower رومیزی با ظاهر سنگی و سبک فانتزی قدیمی",
    "Accessories",
    "DF-TOWER-001",
    19800000,
    7,
  ],

  [
    "40000000-0000-4000-8000-000000000003",
    "50000000-0000-4000-8000-000000000003",
    "60000000-0000-4000-8000-000000000003",
    "30000000-0000-4000-8000-000000000002",
    "forgotten-crypt-map",
    "Forgotten Crypt Battle Map",
    "Battle Map چاپی برای Dungeon و Encounterهای تاریک",
    "Battle Map",
    "MW-CRYPT-001",
    8700000,
    22,
  ],

  [
    "40000000-0000-4000-8000-000000000004",
    "50000000-0000-4000-8000-000000000004",
    "60000000-0000-4000-8000-000000000004",
    "30000000-0000-4000-8000-000000000002",
    "old-tavern-terrain",
    "Old Tavern Terrain Kit",
    "ست Terrain ماژولار برای Tavern و محیط‌های شهری",
    "Terrain",
    "MW-TAVERN-001",
    23500000,
    5,
  ],

  [
    "40000000-0000-4000-8000-000000000005",
    "50000000-0000-4000-8000-000000000005",
    "60000000-0000-4000-8000-000000000005",
    "30000000-0000-4000-8000-000000000003",
    "ancient-red-dragon",
    "Ancient Red Dragon",
    "Miniature باس بزرگ مناسب Encounter نهایی کمپین",
    "Miniature",
    "AM-RED-DRAGON-001",
    31000000,
    4,
  ],

  [
    "40000000-0000-4000-8000-000000000006",
    "50000000-0000-4000-8000-000000000006",
    "60000000-0000-4000-8000-000000000006",
    "30000000-0000-4000-8000-000000000003",
    "undead-warband",
    "Undead Warband",
    "پک Miniature شامل دشمنان Undead برای Encounter",
    "Miniature",
    "AM-UNDEAD-001",
    16500000,
    11,
  ],

  [
    "40000000-0000-4000-8000-000000000007",
    "50000000-0000-4000-8000-000000000007",
    "60000000-0000-4000-8000-000000000007",
    "30000000-0000-4000-8000-000000000004",
    "dm-campaign-journal",
    "DM Campaign Journal",
    "دفتر مدیریت کمپین، NPC، Session و Encounter",
    "GM Tools",
    "DS-JOURNAL-001",
    7200000,
    31,
  ],

  [
    "40000000-0000-4000-8000-000000000008",
    "50000000-0000-4000-8000-000000000008",
    "60000000-0000-4000-8000-000000000008",
    "30000000-0000-4000-8000-000000000004",
    "condition-token-set",
    "Condition Token Set",
    "Tokenهای رومیزی برای نمایش Conditionهای رایج در بازی",
    "Tokens",
    "DS-CONDITION-001",
    6400000,
    26,
  ],
] as const;

async function main() {
  await db
    .insert(marketplaceConfig)
    .values({
      id: "global",
      defaultCommissionBps: 500,
      multiVendorCart: true,
      sellerFulfillment: true,
      platformOwnInventory: false,
    })
    .onConflictDoNothing();

  for (const store of seedStores) {
    await db
      .insert(users)
      .values({
        id: store.userId,
        email: store.email,
        emailVerified: true,
      })
      .onConflictDoNothing();

    await db
      .insert(sellerProfiles)
      .values({
        id: store.sellerId,
        userId: store.userId,
        displayName: store.name,
        status: "ACTIVE",
      })
      .onConflictDoNothing();

    await db
      .insert(stores)
      .values({
        id: store.storeId,
        sellerProfileId: store.sellerId,
        slug: store.slug,
        name: store.name,
        description: store.description,
        category: store.category,
        status: "ACTIVE",
        verified: store.verified,
        ratingHundredths: store.rating,
        reviewCount: store.reviews,
      })
      .onConflictDoNothing();

    await db
      .insert(storeMembers)
      .values({
        storeId: store.storeId,
        userId: store.userId,
        role: "OWNER",
      })
      .onConflictDoNothing();

    if (store.commissionBps !== null) {
      await db
        .insert(storeCommissionSettings)
        .values({
          storeId: store.storeId,
          commissionBps: store.commissionBps,
          active: true,
          reason: "Seed override",
        })
        .onConflictDoNothing();
    }
  }

  for (const item of seedProducts) {
    const [
      productId,
      variantId,
      inventoryId,
      storeId,
      slug,
      name,
      description,
      category,
      sku,
      priceRial,
      stock,
    ] = item;

    await db
      .insert(products)
      .values({
        id: productId,
        storeId,
        slug,
        name,
        description,
        category,
        status: "PUBLISHED",
      })
      .onConflictDoNothing();

    await db
      .insert(productVariants)
      .values({
        id: variantId,
        productId,
        sku,
        name: "Default",
        priceRial,
        isDefault: true,
        status: "ACTIVE",
      })
      .onConflictDoNothing();

    await db
      .insert(inventory)
      .values({
        id: inventoryId,
        variantId,
        quantityOnHand: stock,
        quantityReserved: 0,
      })
      .onConflictDoNothing();
  }

  console.log("Marketplace seed complete.");
}

main()
  .then(async () => {
    await sqlClient.end({
      timeout: 5,
    });
  })
  .catch(async (error) => {
    console.error(error);

    await sqlClient.end({
      timeout: 5,
    });

    process.exit(1);
  });