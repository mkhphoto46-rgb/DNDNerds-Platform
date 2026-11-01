export const CART_STORAGE_KEY =
  "dnd-nerds-marketplace-cart-v1";

export const CART_CHANGED_EVENT =
  "dndnerds:cart-changed";

export type CartItem = {
  productId: string;
  variantId?: string;
  storeSlug: string;
  productSlug: string;
  productName: string;
  storeName: string;
  unitPriceToman: number;
  inventory: number;
  quantity: number;
};

export function cartItemKey(item: Pick<CartItem,'productId'|'variantId'>){return `${item.productId}:${item.variantId??'default'}`;}

function sanitizeQuantity(
  value: number,
  max: number,
) {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(
    1,
    Math.min(
      Math.floor(value),
      Math.max(1, max),
    ),
  );
}

function isCartItem(
  value: unknown,
): value is CartItem {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const item =
    value as Partial<CartItem>;

  return (
    typeof item.productId === "string" &&
    typeof item.storeSlug === "string" &&
    typeof item.productSlug === "string" &&
    typeof item.productName === "string" &&
    typeof item.storeName === "string" &&
    typeof item.unitPriceToman === "number" &&
    typeof item.inventory === "number" &&
    typeof item.quantity === "number"
  );
}

export function readCart(): CartItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw =
      window.localStorage.getItem(
        CART_STORAGE_KEY,
      );

    if (!raw) {
      return [];
    }

    const parsed: unknown =
      JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(isCartItem)
      .map(
        (item) => ({
          ...item,

          quantity:
            sanitizeQuantity(
              item.quantity,
              item.inventory,
            ),
        }),
      );
  }
  catch {
    return [];
  }
}

export function writeCart(
  items: CartItem[],
) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    CART_STORAGE_KEY,
    JSON.stringify(items),
  );

  window.dispatchEvent(
    new Event(
      CART_CHANGED_EVENT,
    ),
  );
}

export function addCartItem(
  incoming:
    Omit<CartItem, "quantity"> & {
      quantity: number;
    },
) {
  const current =
    readCart();

  const existing =
    current.find(
      (item) =>
        item.productId === incoming.productId && item.variantId === incoming.variantId,
    );

  let next:
    CartItem[];

  if (existing) {
    next =
      current.map(
        (item) => {
          if (
            item.productId !== incoming.productId || item.variantId !== incoming.variantId
          ) {
            return item;
          }

          return {
            ...item,

            inventory:
              incoming.inventory,

            unitPriceToman:
              incoming.unitPriceToman,

            quantity:
              sanitizeQuantity(
                item.quantity +
                  incoming.quantity,
                incoming.inventory,
              ),
          };
        },
      );
  }
  else {
    next = [
      ...current,

      {
        ...incoming,

        quantity:
          sanitizeQuantity(
            incoming.quantity,
            incoming.inventory,
          ),
      },
    ];
  }

  writeCart(next);

  return next;
}

export function setCartItemQuantity(key:string,quantity:number){
 const target=key.includes(':')?key:`${key}:default`;
 const next=readCart().map(item=>cartItemKey(item)===target?{...item,quantity:sanitizeQuantity(quantity,item.inventory)}:item);writeCart(next);return next;
}
export function removeCartItem(key:string){const target=key.includes(':')?key:`${key}:default`;const next=readCart().filter(item=>cartItemKey(item)!==target);writeCart(next);return next;}

export function clearCart() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(
    CART_STORAGE_KEY,
  );

  window.dispatchEvent(
    new Event(
      CART_CHANGED_EVENT,
    ),
  );
}

export function cartItemCount(
  items: CartItem[],
) {
  return items.reduce(
    (
      total,
      item,
    ) =>
      total +
      item.quantity,
    0,
  );
}