"use client";

import Link from "next/link";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  CART_CHANGED_EVENT,
  clearCart,
  readCart,
  removeCartItem,
  setCartItemQuantity,
  type CartItem,
} from "@/lib/cart";

import styles from "./cart.module.css";

type PreviewLine = {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceToman: number;
  lineTotalToman: number;
};

type PreviewSellerOrder = {
  storeId: string;
  storeName: string;
  storeSlug: string;
  grossToman: number;
  items: PreviewLine[];
};

type CheckoutPreview = {
  mode: string;
  customerTotalToman: number;
  sellerOrders: PreviewSellerOrder[];
  source: "postgresql";
};

function formatToman(
  value: number,
) {
  return (
    new Intl.NumberFormat(
      "fa-IR",
    ).format(value) +
    " تومان"
  );
}

export default function CartPage() {
  const [
    items,
    setItems,
  ] =
    useState<CartItem[]>([]);

  const [
    hydrated,
    setHydrated,
  ] =
    useState(false);

  const [
    preview,
    setPreview,
  ] =
    useState<CheckoutPreview | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  useEffect(
    () => {
      function sync() {
        setItems(
          readCart(),
        );
      }

      sync();
      setHydrated(true);

      window.addEventListener(
        "storage",
        sync,
      );

      window.addEventListener(
        CART_CHANGED_EVENT,
        sync,
      );

      return () => {
        window.removeEventListener(
          "storage",
          sync,
        );

        window.removeEventListener(
          CART_CHANGED_EVENT,
          sync,
        );
      };
    },
    [],
  );

  useEffect(
    () => {
      if (!hydrated) {
        return;
      }

      if (items.length === 0) {
        setPreview(null);
        setError(null);
        setLoading(false);
        return;
      }

      const controller =
        new AbortController();

      async function loadPreview() {
        setLoading(true);
        setError(null);

        try {
          const response =
            await fetch(
              "/api/marketplace/checkout/preview",
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    items:
                      items.map(
                        (item) => ({
                          productId:
                            item.productId,

                          quantity:
                            item.quantity,
                        }),
                      ),
                  }),

                signal:
                  controller.signal,
              },
            );

          const data =
            await response.json();

          if (!response.ok) {
            const message =
              data?.error?.message;

            throw new Error(
              typeof message ===
                "string"
                ? message
                : "خطا در اعتبارسنجی سبد خرید",
            );
          }

          setPreview(
            data as CheckoutPreview,
          );
        }
        catch (reason) {
          if (
            reason instanceof DOMException &&
            reason.name ===
              "AbortError"
          ) {
            return;
          }

          setPreview(null);

          setError(
            reason instanceof Error
              ? reason.message
              : "خطا در اعتبارسنجی سبد خرید",
          );
        }
        finally {
          if (
            !controller.signal
              .aborted
          ) {
            setLoading(false);
          }
        }
      }

      void loadPreview();

      return () => {
        controller.abort();
      };
    },
    [
      hydrated,
      items,
    ],
  );

  const currentLines =
    useMemo(
      () => {
        const map =
          new Map<
            string,
            PreviewLine
          >();

        for (
          const seller
          of preview?.sellerOrders ??
          []
        ) {
          for (
            const line
            of seller.items
          ) {
            map.set(
              line.productId,
              line,
            );
          }
        }

        return map;
      },
      [
        preview,
      ],
    );

  function setQuantity(
    productId: string,
    quantity: number,
  ) {
    const next =
      setCartItemQuantity(
        productId,
        quantity,
      );

    setItems(next);
  }

  function remove(
    productId: string,
  ) {
    const next =
      removeCartItem(
        productId,
      );

    setItems(next);
  }

  function clear() {
    clearCart();
    setItems([]);
  }

  if (
    hydrated &&
    items.length === 0
  ) {
    return (
      <main className={styles.page}>

        <section className={styles.empty}>

          <div className={styles.eyebrow}>
            MARKETPLACE CART
          </div>

          <h1>
            سبد خرید خالی است
          </h1>

          <p>
            از Marketplace یک محصول انتخاب کن
            و به سبد خرید اضافه کن
          </p>

          <Link
            href="/store"
            className={styles.primaryButton}
          >
            رفتن به Marketplace
          </Link>

        </section>

      </main>
    );
  }

  return (
    <main className={styles.page}>

      <div className={styles.shell}>

        <div className={styles.topbar}>

          <div>

            <div className={styles.eyebrow}>
              DND NERDS MARKETPLACE
            </div>

            <h1>
              سبد خرید
            </h1>

          </div>

          <Link
            href="/store"
            className={styles.backLink}
          >
            ادامه خرید
          </Link>

        </div>

        {!hydrated ? (
          <div className={styles.statusCard}>
            در حال خواندن سبد خرید
          </div>
        ) : (
          <>

            <section className={styles.cartGrid}>

              <div className={styles.itemsPanel}>

                {items.map(
                  (item) => {
                    const line =
                      currentLines.get(
                        item.productId,
                      );

                    const unitPrice =
                      line?.unitPriceToman ??
                      item.unitPriceToman;

                    const lineTotal =
                      line?.lineTotalToman ??
                      unitPrice *
                        item.quantity;

                    return (
                      <article
                        key={item.productId}
                        className={styles.itemCard}
                      >

                        <div className={styles.itemMain}>

                          <small>
                            {item.storeName}
                          </small>

                          <h2>
                            {item.productName}
                          </h2>

                          <div className={styles.itemMeta}>
                            <span>
                              {formatToman(
                                unitPrice,
                              )}
                            </span>

                            <span>
                              موجودی ثبت‌شده:
                              {" "}
                              {item.inventory}
                            </span>
                          </div>

                        </div>

                        <div className={styles.controls}>

                          <button
                            type="button"
                            onClick={
                              () =>
                                setQuantity(
                                  item.productId,
                                  Math.max(
                                    1,
                                    item.quantity -
                                      1,
                                  ),
                                )
                            }
                            disabled={
                              item.quantity <=
                              1
                            }
                          >
                            −
                          </button>

                          <strong>
                            {item.quantity}
                          </strong>

                          <button
                            type="button"
                            onClick={
                              () =>
                                setQuantity(
                                  item.productId,
                                  Math.min(
                                    item.inventory,
                                    item.quantity +
                                      1,
                                  ),
                                )
                            }
                            disabled={
                              item.quantity >=
                              item.inventory
                            }
                          >
                            +
                          </button>

                        </div>

                        <div className={styles.itemBottom}>

                          <strong>
                            {formatToman(
                              lineTotal,
                            )}
                          </strong>

                          <button
                            type="button"
                            className={styles.removeButton}
                            onClick={
                              () =>
                                remove(
                                  item.productId,
                                )
                            }
                          >
                            حذف
                          </button>

                        </div>

                      </article>
                    );
                  },
                )}

                <button
                  type="button"
                  className={styles.clearButton}
                  onClick={clear}
                >
                  خالی کردن سبد خرید
                </button>

              </div>

              <aside className={styles.summary}>

                <div className={styles.summaryHead}>

                  <div>

                    <small>
                      DATABASE VERIFIED
                    </small>

                    <h2>
                      خلاصه سفارش
                    </h2>

                  </div>

                  <span
                    className={
                      error
                        ? styles.badgeError
                        : loading
                          ? styles.badgeLoading
                          : styles.badgeReady
                    }
                  >
                    {error
                      ? "ERROR"
                      : loading
                        ? "CHECKING"
                        : preview
                          ? "VERIFIED"
                          : "WAITING"}
                  </span>

                </div>

                {error && (
                  <div className={styles.errorBox}>
                    {error}
                  </div>
                )}

                {preview && (
                  <>

                    <div className={styles.sellerGroups}>

                      {preview.sellerOrders.map(
                        (order) => (
                          <div
                            key={order.storeId}
                            className={styles.sellerGroup}
                          >

                            <div className={styles.sellerHead}>

                              <strong>
                                {order.storeName}
                              </strong>

                              <span>
                                {formatToman(
                                  order.grossToman,
                                )}
                              </span>

                            </div>

                            {order.items.map(
                              (line) => (
                                <div
                                  key={line.productId}
                                  className={styles.sellerLine}
                                >
                                  <span>
                                    {line.productName}
                                    {" × "}
                                    {line.quantity}
                                  </span>

                                  <span>
                                    {formatToman(
                                      line.lineTotalToman,
                                    )}
                                  </span>
                                </div>
                              ),
                            )}

                          </div>
                        ),
                      )}

                    </div>

                    <div className={styles.totalRow}>

                      <span>
                        مبلغ کل
                      </span>

                      <strong>
                        {formatToman(
                          preview.customerTotalToman,
                        )}
                      </strong>

                    </div>

                    <p className={styles.note}>
                      قیمت و موجودی این سبد در لحظه
                      از PostgreSQL بررسی شده و
                      سفارش‌ها بر اساس فروشنده
                      تفکیک شده‌اند
                    </p>

                  </>
                )}

                <Link href="/checkout" className={styles.checkoutButton}>ادامه و ثبت سفارش</Link>

              </aside>

            </section>

          </>
        )}

      </div>

    </main>
  );
}