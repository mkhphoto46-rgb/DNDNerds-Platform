"use client";

import Link from "next/link";
import {
  useState,
} from "react";

import {
  addCartItem,
} from "@/lib/cart";

import styles from "./add-to-cart-button.module.css";

type Props = {
  productId: string;
  variantId?: string;
  capacityWindowId?: string;
  expectedCapacityVersion?: number;
  productionStartsAt?: string;
  productionEndsAt?: string;
  productSlug: string;
  productName: string;
  storeSlug: string;
  storeName: string;
  unitPriceToman: number;
  inventory: number;
};

export function AddToCartButton({
  productId,
  variantId,
  capacityWindowId,expectedCapacityVersion,productionStartsAt,productionEndsAt,
  productSlug,
  productName,
  storeSlug,
  storeName,
  unitPriceToman,
  inventory,
}: Props) {
  const [
    quantity,
    setQuantity,
  ] =
    useState(1);

  const [
    added,
    setAdded,
  ] =
    useState(false);

  const outOfStock =
    inventory <= 0;
  const [error,setError]=useState('');

  function add() {
    if (outOfStock) {
      return;
    }

    try{addCartItem({
      productId,
  variantId,
      capacityWindowId,expectedCapacityVersion,productionStartsAt,productionEndsAt,
      productSlug,
      productName,
      storeSlug,
      storeName,
      unitPriceToman,
      inventory,
      quantity,
    });setError('');}catch(e){setError(e instanceof Error?e.message:'افزودن انجام نشد.');return;}

    setAdded(true);
  }

  return (
    <div className={styles.wrap}>
      {error&&<p role="alert">{error}</p>}

      <div className={styles.quantityRow}>

        <button
          type="button"
          className={styles.quantityButton}
          onClick={
            () =>
              setQuantity(
                (value) =>
                  Math.max(
                    1,
                    value - 1,
                  ),
              )
          }
          disabled={
            outOfStock ||
            quantity <= 1
          }
          aria-label="کاهش تعداد"
        >
          −
        </button>

        <span className={styles.quantityValue}>
          {quantity}
        </span>

        <button
          type="button"
          className={styles.quantityButton}
          onClick={
            () =>
              setQuantity(
                (value) =>
                  Math.min(
                    inventory,
                    value + 1,
                  ),
              )
          }
          disabled={
            outOfStock ||
            quantity >= inventory
          }
          aria-label="افزایش تعداد"
        >
          +
        </button>

      </div>

      <button
        type="button"
        className={styles.addButton}
        onClick={add}
        disabled={outOfStock}
      >
        {outOfStock
          ? "ناموجود"
          : added
            ? "به سبد اضافه شد"
            : "افزودن به سبد خرید"}
      </button>

      {added && (
        <Link
          href="/cart"
          className={styles.cartLink}
        >
          مشاهده سبد خرید
        </Link>
      )}

    </div>
  );
}
