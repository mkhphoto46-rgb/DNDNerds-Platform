"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import {
  useSearchParams,
} from "next/navigation";

import styles from "./payment-result.module.css";

type PaymentSummary = {
  order?: {
    id: string;
    status: string;
    amountRial: number;
    currency: string;
  };

  intent?: {
    id: string;
    provider: string;
    status: string;
    lastErrorCode?: string | null;
  } | null;

  providerBinding?: {
    providerKey: string;
    providerStatus?: string | null;
    providerReference?: string | null;
  } | null;

  payment?: {
    id: string;
    provider: string;
    providerPaymentId: string;
    status: string;
    amountRial: number;
  } | null;

  error?: {
    code?: string;
    message?: string;
  };
};

function formatRial(
  value:
    number | undefined,
) {
  if (
    typeof value !==
    "number"
  ) {
    return "—";
  }

  return (
    new Intl.NumberFormat(
      "fa-IR",
    ).format(value) +
    " ریال"
  );
}

export function PaymentResultClient() {
  const searchParams =
    useSearchParams();

  const orderId =
    searchParams.get(
      "orderId",
    ) ??
    "";

  const callbackStatus =
    searchParams.get(
      "status",
    ) ??
    "unknown";

  const [loading, setLoading] =
    useState(true);

  const [summary, setSummary] =
    useState<PaymentSummary | null>(
      null,
    );

  const [error, setError] =
    useState<string | null>(
      null,
    );

  useEffect(
    () => {
      if (!orderId) {
        setError(
          "شناسه سفارش در نتیجه پرداخت وجود ندارد.",
        );
        setLoading(false);
        return;
      }

      let cancelled =
        false;

      async function load() {
        try {
          const response =
            await fetch(
              `/api/marketplace/orders/${encodeURIComponent(
                orderId,
              )}/payment`,
              {
                cache:
                  "no-store",
              },
            );

          const data =
            await response
              .json() as
              PaymentSummary;

          if (cancelled) {
            return;
          }

          if (!response.ok) {
            throw new Error(
              data
                ?.error
                ?.message ??
              "وضعیت پرداخت دریافت نشد.",
            );
          }

          setSummary(
            data,
          );
        }
        catch (reason) {
          if (cancelled) {
            return;
          }

          setError(
            reason instanceof Error
              ? reason.message
              : "وضعیت پرداخت دریافت نشد.",
          );
        }
        finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      }

      void load();

      return () => {
        cancelled =
          true;
      };
    },
    [orderId],
  );

  const paid =
    summary
      ?.payment
      ?.status ===
        "SUCCEEDED" ||
    summary
      ?.order
      ?.status ===
        "PAID";

  const title =
    paid
      ? "پرداخت با موفقیت ثبت شد"
      : callbackStatus ===
          "pending"
        ? "پرداخت در حال بررسی است"
        : callbackStatus ===
            "failed"
          ? "پرداخت موفق نبود"
          : "نتیجه پرداخت";

  return (
    <section className={styles.card}>
      <div className={styles.eyebrow}>
        PAYMENT RESULT
      </div>

      <h1>
        {title}
      </h1>

      {loading ? (
        <p>
          در حال دریافت وضعیت قطعی از سرور...
        </p>
      ) : error ? (
        <div className={styles.error}>
          {error}
        </div>
      ) : (
        <>
          <div className={styles.grid}>
            <div>
              <span>وضعیت سفارش</span>
              <strong>
                {summary?.order?.status ?? "—"}
              </strong>
            </div>

            <div>
              <span>Payment Intent</span>
              <strong>
                {summary?.intent?.status ?? "—"}
              </strong>
            </div>

            <div>
              <span>Provider</span>
              <strong>
                {summary
                  ?.providerBinding
                  ?.providerKey ??
                summary
                  ?.intent
                  ?.provider ??
                "—"}
              </strong>
            </div>

            <div>
              <span>مبلغ</span>
              <strong>
                {formatRial(
                  summary
                    ?.order
                    ?.amountRial,
                )}
              </strong>
            </div>
          </div>

          {summary
            ?.providerBinding
            ?.providerReference && (
            <p className={styles.reference}>
              Reference:
              {" "}
              <strong>
                {
                  summary
                    .providerBinding
                    .providerReference
                }
              </strong>
            </p>
          )}
        </>
      )}

      <div className={styles.actions}>
        {orderId && (
          <Link
            href={`/orders/${encodeURIComponent(
              orderId,
            )}`}
          >
            مشاهده سفارش
          </Link>
        )}

        <Link href="/store">
          بازگشت به Marketplace
        </Link>
      </div>
    </section>
  );
}
