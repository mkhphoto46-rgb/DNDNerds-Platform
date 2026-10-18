export type MarketplaceTone =
  | "crimson"
  | "gold"
  | "ember"
  | "wine";

export type MarketplaceStore = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  rating: number;
  reviewCount: number;
  verified: boolean;
  fulfillmentMode: string;
  productCount: number;
  commissionBps: number;
  commissionPercent: number;
};

export type StoreProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  priceRial: number;
  priceToman: number;
  inventory: number;
};

export type MarketplaceStoreDetail = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  rating: number;
  reviewCount: number;
  verified: boolean;
  fulfillmentMode: string;
  commissionBps: number;
  commissionPercent: number;
  products: StoreProduct[];
  source: "postgresql";
};

export type MarketplaceProduct = {
  id: string;
  storeId: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  priceRial: number;
  priceToman: number;
  inventory: number;
  store: {
    id: string;
    slug: string;
    name: string;
    verified: boolean;
  };
};

export type MarketplaceProductDetail =
  MarketplaceProduct & {
    source: "postgresql";
  };

type StoresResponse = {
  data: MarketplaceStore[];
  source: "postgresql";
};

type ProductsResponse = {
  data: MarketplaceProduct[];
  pagination: {
    returned: number;
  };
  source: "postgresql";
};

const API_BASE_URL =
  process.env.MARKETPLACE_API_BASE_URL ??
  "http://127.0.0.1:4100";

async function requestJson<T>(
  path: string,
): Promise<T> {
  const response =
    await fetch(
      `${API_BASE_URL}${path}`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      },
    );

  if (!response.ok) {
    throw new Error(
      `Marketplace API request failed: ${response.status} ${response.statusText}`,
    );
  }

  return (
    await response.json()
  ) as T;
}

async function requestNullable<T>(
  path: string,
): Promise<T | null> {
  const response =
    await fetch(
      `${API_BASE_URL}${path}`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      },
    );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Marketplace API request failed: ${response.status} ${response.statusText}`,
    );
  }

  return (
    await response.json()
  ) as T;
}

export async function getMarketplaceStores() {
  const result =
    await requestJson<StoresResponse>(
      "/api/v1/stores",
    );

  return result.data;
}

export async function getMarketplaceProducts() {
  const result =
    await requestJson<ProductsResponse>(
      "/api/v1/products",
    );

  return result.data;
}

export async function getMarketplaceStore(
  storeSlug: string,
) {
  return requestNullable<MarketplaceStoreDetail>(
    `/api/v1/stores/${encodeURIComponent(
      storeSlug,
    )}`,
  );
}

export async function getMarketplaceProduct(
  storeSlug: string,
  productSlug: string,
) {
  return requestNullable<MarketplaceProductDetail>(
    `/api/v1/stores/${encodeURIComponent(
      storeSlug,
    )}/products/${encodeURIComponent(
      productSlug,
    )}`,
  );
}

export function formatToman(
  value: number,
) {
  return (
    new Intl.NumberFormat(
      "fa-IR",
    ).format(value) +
    " تومان"
  );
}

export function marketplaceTone(
  key: string,
): MarketplaceTone {
  const tones:
    MarketplaceTone[] = [
      "crimson",
      "gold",
      "ember",
      "wine",
    ];

  let score = 0;

  for (
    let index = 0;
    index < key.length;
    index += 1
  ) {
    score +=
      key.charCodeAt(index);
  }

  return (
    tones[
      score %
      tones.length
    ] ??
    "crimson"
  );
}