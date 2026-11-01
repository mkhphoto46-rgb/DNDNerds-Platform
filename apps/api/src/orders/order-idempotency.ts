import {
  createHash,
} from "node:crypto";

export type OrderHashInput = {
  checkoutSnapshotId?: string;
  address: {
    fullName: string;
    phone: string;
    province: string;
    city: string;
    addressLine1: string;
    addressLine2?: string;
    postalCode: string;
  };

  items:
    Array<{
      productId: string;
      quoteId?: string;
      variantId?: string;
      expectedPriceRial?: number;
      quantity: number;
    }>;
};

export function hashOrderRequest(
  input:
    OrderHashInput,
) {
  const canonical = {
    version:
      1,
    ...(input.checkoutSnapshotId ? {checkoutSnapshotId:input.checkoutSnapshotId}:{}),

    address: {
      fullName:
        input.address.fullName,

      phone:
        input.address.phone,

      countryCode:
        "IR",

      province:
        input.address.province,

      city:
        input.address.city,

      addressLine1:
        input.address.addressLine1,

      addressLine2:
        input.address.addressLine2 ??
        "",

      postalCode:
        input.address.postalCode,
    },

    items:
      [...input.items]
        .sort(
          (
            left,
            right,
          ) =>
            `${left.productId}:${left.variantId ?? ""}`.localeCompare(
              `${right.productId}:${right.variantId ?? ""}`,
            ),
        )
        .map(
          item => ({
            productId:
              item.productId,

            ...(item.variantId ? { variantId:item.variantId, expectedPriceRial:item.expectedPriceRial } : {}),
            ...(item.quoteId ? {quoteId:item.quoteId}:{}),
            quantity:
              item.quantity,
          }),
        ),
  };

  return createHash(
    "sha256",
  )
    .update(
      JSON.stringify(
        canonical,
      ),
      "utf8",
    )
    .digest(
      "hex",
    );
}
