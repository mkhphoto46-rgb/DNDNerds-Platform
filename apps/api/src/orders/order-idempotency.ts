import {
  createHash,
} from "node:crypto";

export type OrderHashInput = {
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
            left.productId.localeCompare(
              right.productId,
            ),
        )
        .map(
          item => ({
            productId:
              item.productId,

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
