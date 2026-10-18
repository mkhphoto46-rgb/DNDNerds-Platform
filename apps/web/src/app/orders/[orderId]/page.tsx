"use client";

import Link from "next/link";

import {
  use,
  useEffect,
  useState,
} from "react";

import styles from "../orders.module.css";

type OrderDetail = {
  order: {
    id: string;
    status: string;
    customerTotalToman: number;
    createdAt: string;
  };

  address: {
    fullName: string;
    phone: string;
    province: string;
    city: string;
    addressLine1: string;
    addressLine2: string | null;
    postalCode: string;
  } | null;

  sellerOrders: Array<{
    id: string;
    storeName: string;
    status: string;
    grossToman: number;

    items: Array<{
      id: string;
      productName: string;
      quantity: number;
      lineTotalToman: number;
    }>;
  }>;
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

export default function OrderDetailPage({
  params,
}: {
  params:
    Promise<{
      orderId: string;
    }>;
}) {
  const {
    orderId,
  } =
    use(params);

  const [
    detail,
    setDetail,
  ] =
    useState<OrderDetail | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  async function load() {
    setLoading(true);

    try {
      const response =
        await fetch(
          `/api/marketplace/orders/${encodeURIComponent(
            orderId,
          )}`,
          {
            cache:
              "no-store",
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error?.message ??
          "سفارش پیدا نشد",
        );
      }

      setDetail(
        data as OrderDetail,
      );
    }
    catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "خطا در دریافت سفارش",
      );
    }
    finally {
      setLoading(false);
    }
  }

  useEffect(
    () => {
      void load();
    },
    [
      orderId,
    ],
  );

  async function cancel() {
    const response =
      await fetch(
        `/api/marketplace/orders/${encodeURIComponent(
          orderId,
        )}/cancel`,
        {
          method:
            "POST",
        },
      );

    const data =
      await response.json();

    if (!response.ok) {
      setError(
        data?.error?.message ??
        "لغو سفارش انجام نشد",
      );

      return;
    }

    setDetail(
      data as OrderDetail,
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>
            ORDER DETAIL
          </div>

          <h1>
            جزئیات سفارش
          </h1>

          <Link
            href="/orders"
            className={styles.linkButton}
          >
            همه سفارش‌ها
          </Link>
        </header>

        {loading ? (
          <div className={styles.notice}>
            در حال دریافت...
          </div>
        ) : error ? (
          <div className={styles.notice}>
            {error}
          </div>
        ) : detail ? (
          <>
            <section className={styles.panel}>
              <div className={styles.line}>
                <span>
                  Order ID
                </span>

                <strong>
                  {detail.order.id}
                </strong>
              </div>

              <div className={styles.line}>
                <span>
                  Status
                </span>

                <strong>
                  {detail.order.status}
                </strong>
              </div>

              <div className={styles.line}>
                <span>
                  مبلغ
                </span>

                <strong>
                  {formatToman(
                    detail.order.customerTotalToman,
                  )}
                </strong>
              </div>
            </section>

            {detail.address && (
              <section className={styles.panel}>
                <h2>
                  آدرس ثبت‌شده سفارش
                </h2>

                <div className={styles.address}>
                  {detail.address.fullName}
                  <br />

                  {detail.address.phone}
                  <br />

                  {detail.address.province}
                  {"، "}
                  {detail.address.city}
                  <br />

                  {detail.address.addressLine1}

                  {detail.address.addressLine2
                    ? `، ${detail.address.addressLine2}`
                    : ""}

                  <br />

                  کد پستی:
                  {" "}
                  {detail.address.postalCode}
                </div>
              </section>
            )}

            <section className={styles.panel}>
              <h2>
                Seller Orders
              </h2>

              {detail.sellerOrders.map(
                (seller) => (
                  <article
                    className={styles.seller}
                    key={seller.id}
                  >
                    <div className={styles.line}>
                      <strong>
                        {seller.storeName}
                      </strong>

                      <span>
                        {seller.status}
                      </span>
                    </div>

                    {seller.items.map(
                      (item) => (
                        <div
                          className={styles.line}
                          key={item.id}
                        >
                          <span>
                            {item.productName}
                            {" × "}
                            {item.quantity}
                          </span>

                          <span>
                            {formatToman(
                              item.lineTotalToman,
                            )}
                          </span>
                        </div>
                      ),
                    )}
                  </article>
                ),
              )}
            </section>

            {detail.order.status ===
              "PENDING_PAYMENT" && (
              <div className={styles.actions}>
                <button
                  type="button"
                  className={`${styles.button} ${styles.danger}`}
                  onClick={
                    () => void cancel()
                  }
                >
                  لغو سفارش و آزاد کردن موجودی
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}