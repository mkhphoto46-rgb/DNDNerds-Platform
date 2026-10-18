export type MarketplaceStore = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  ownerUserId: string;
  rating: number;
  reviewCount: number;
  verified: boolean;
  commissionBpsOverride: number | null;
  fulfillmentMode: "SELLER";
};

export type MarketplaceProduct = {
  id: string;
  storeId: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  priceToman: number;
  inventory: number;
  active: boolean;
};

export const stores: MarketplaceStore[] = [
  {
    id: "store_dragon_forge",
    slug: "dragon-forge",
    name: "Dragon Forge",
    description:
      "دایس، اکسسوری و تجهیزات میز بازی با طراحی فانتزی",
    category: "Dice & Accessories",
    ownerUserId: "user_mock_001",
    rating: 4.9,
    reviewCount: 128,
    verified: true,
    commissionBpsOverride: 400,
    fulfillmentMode: "SELLER",
  },
  {
    id: "store_mimic_workshop",
    slug: "mimic-workshop",
    name: "Mimic Workshop",
    description:
      "Battle Map، Terrain و ابزارهای فیزیکی برای Game Masterها",
    category: "Maps & Terrain",
    ownerUserId: "user_mock_002",
    rating: 4.8,
    reviewCount: 84,
    verified: true,
    commissionBpsOverride: null,
    fulfillmentMode: "SELLER",
  },
  {
    id: "store_arcane_miniatures",
    slug: "arcane-miniatures",
    name: "Arcane Miniatures",
    description:
      "Miniatureهای فانتزی برای کمپین‌ها و Encounterهای رومیزی",
    category: "Miniatures",
    ownerUserId: "user_mock_003",
    rating: 4.7,
    reviewCount: 63,
    verified: true,
    commissionBpsOverride: null,
    fulfillmentMode: "SELLER",
  },
  {
    id: "store_dungeon_supply",
    slug: "dungeon-supply",
    name: "Dungeon Supply",
    description:
      "ابزار DM، Token، Notebook و لوازم کاربردی TTRPG",
    category: "GM Tools",
    ownerUserId: "user_mock_004",
    rating: 4.6,
    reviewCount: 47,
    verified: false,
    commissionBpsOverride: 450,
    fulfillmentMode: "SELLER",
  },
];

export const products: MarketplaceProduct[] = [
  {
    id: "prod_bloodmoon_dice",
    storeId: "store_dragon_forge",
    slug: "bloodmoon-dice-set",
    name: "Bloodmoon Dice Set",
    description:
      "ست کامل دایس رزینی با تم قرمز تیره و طلایی",
    category: "Dice",
    priceToman: 1450000,
    inventory: 14,
    active: true,
  },
  {
    id: "prod_ancient_dice_tower",
    storeId: "store_dragon_forge",
    slug: "ancient-dice-tower",
    name: "Ancient Dice Tower",
    description:
      "Dice Tower رومیزی با ظاهر سنگی و سبک فانتزی قدیمی",
    category: "Accessories",
    priceToman: 1980000,
    inventory: 7,
    active: true,
  },
  {
    id: "prod_crypt_map",
    storeId: "store_mimic_workshop",
    slug: "forgotten-crypt-map",
    name: "Forgotten Crypt Battle Map",
    description:
      "Battle Map چاپی برای Dungeon و Encounterهای تاریک",
    category: "Battle Map",
    priceToman: 870000,
    inventory: 22,
    active: true,
  },
  {
    id: "prod_tavern_terrain",
    storeId: "store_mimic_workshop",
    slug: "old-tavern-terrain",
    name: "Old Tavern Terrain Kit",
    description:
      "ست Terrain ماژولار برای Tavern و محیط‌های شهری",
    category: "Terrain",
    priceToman: 2350000,
    inventory: 5,
    active: true,
  },
  {
    id: "prod_red_dragon",
    storeId: "store_arcane_miniatures",
    slug: "ancient-red-dragon",
    name: "Ancient Red Dragon",
    description:
      "Miniature باس بزرگ مناسب Encounter نهایی کمپین",
    category: "Miniature",
    priceToman: 3100000,
    inventory: 4,
    active: true,
  },
  {
    id: "prod_undead_pack",
    storeId: "store_arcane_miniatures",
    slug: "undead-warband",
    name: "Undead Warband",
    description:
      "پک Miniature شامل دشمنان Undead برای Encounter",
    category: "Miniature",
    priceToman: 1650000,
    inventory: 11,
    active: true,
  },
  {
    id: "prod_dm_journal",
    storeId: "store_dungeon_supply",
    slug: "dm-campaign-journal",
    name: "DM Campaign Journal",
    description:
      "دفتر مدیریت کمپین، NPC، Session و Encounter",
    category: "GM Tools",
    priceToman: 720000,
    inventory: 31,
    active: true,
  },
  {
    id: "prod_condition_tokens",
    storeId: "store_dungeon_supply",
    slug: "condition-token-set",
    name: "Condition Token Set",
    description:
      "Tokenهای رومیزی برای نمایش Conditionهای رایج در بازی",
    category: "Tokens",
    priceToman: 640000,
    inventory: 26,
    active: true,
  },
];