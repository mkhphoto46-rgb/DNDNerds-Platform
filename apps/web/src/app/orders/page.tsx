"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import styles from "./orders.module.css";

type OrderRow = {
  id: string;
  status: string;
  customerTotalToman: number;
  createdAt: string;
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

export default function OrdersPage() {
  const [
    rows,
    setRows,
  ] =
    useState<OrderRow[]>([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    unauthorized,
    setUnauthorized,
  ] =
    useState(false);

  useEffect(
    () => {
      async function load() {
        try {
          const response =
            await fetch(
              "/api/marketplace/orders",
              {
                cache:
                  "no-store",
              },
            );

          if (
            response.status ===
            401
          ) {
            setUnauthorized(true);
            return;
          }

          const data =
            await response.json();

          if (response.ok) {
            setRows(
              data.data ?? [],
            );
          }
        }
        finally {
          setLoading(false);
        }
      }

      void load();
    },
    [],
  );

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>
            MY ORDERS
          </div>

          <h1>
            سفارش‌های من
          </h1>
        </header>

        {loading ? (
          <div className={styles.notice}>
            در حال دریافت سفارش‌ها...
          </div>
        ) : unauthorized ? (
          <div className={styles.notice}>
            برای دیدن سفارش‌ها
            {" "}
            <Link href="/login">
              وارد شو
            </Link>.
          </div>
        ) : rows.length === 0 ? (
          <div className={styles.notice}>
            هنوز سفارشی نداری.
          </div>
        ) : (
          <section className={styles.list}>
            {rows.map(
              (order) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className={styles.card}
                >
                  <div>
                    <small>
                      {new Date(
                        order.createdAt,
                      ).toLocaleString(
                        "fa-IR",
                      )}
                    </small>

                    <div>
                      {order.id}
                    </div>
                  </div>

                  <div>
                    <strong>
                      {formatToman(
                        order.customerTotalToman,
                      )}
                    </strong>

                    <div className={styles.muted}>
                      {order.status}
                    </div>
                  </div>
                </Link>
              ),
            )}
          </section>
        )}
      </div>
    </main>
  );
}