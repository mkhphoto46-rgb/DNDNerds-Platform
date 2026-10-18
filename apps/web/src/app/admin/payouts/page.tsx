"use client";

import {
  useEffect,
  useState,
} from "react";

import styles from "../../seller/seller-dashboard.module.css";

type Row = {
  id: string;
  storeId: string;
  storeName: string;
  amountRial: number;
  status: string;
  payoutReference: string | null;
};

function toman(
  rial: number,
) {
  return (
    new Intl.NumberFormat(
      "fa-IR",
    ).format(
      Math.trunc(
        rial / 10,
      ),
    ) +
    " تومان"
  );
}

export default function AdminPayoutsPage() {
  const [
    rows,
    setRows,
  ] =
    useState<Row[]>([]);

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  async function load() {
    const response =
      await fetch(
        "/api/admin/marketplace/payouts",
        {
          cache:
            "no-store",
        },
      );

    const body =
      await response.json();

    if (!response.ok) {
      throw new Error(
        body?.error?.message ??
        "Payout list failed",
      );
    }

    setRows(
      body.data ??
      [],
    );
  }

  useEffect(
    () => {
      void load()
        .catch(
          (reason) =>
            setError(
              reason instanceof Error
                ? reason.message
                : "Load failed",
            ),
        );
    },
    [],
  );

  async function review(
    id: string,
    action:
      | "APPROVE"
      | "REJECT",
  ) {
    const response =
      await fetch(
        `/api/admin/marketplace/payouts/${id}/review`,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              action,
              password,
              reason:
                `Admin payout ${action}`,
            }),
        },
      );

    const body =
      await response.json();

    if (!response.ok) {
      setError(
        body?.error?.message ??
        "Payout review failed",
      );

      return;
    }

    setError(null);
    await load();
  }

  async function markPaid(
    id: string,
  ) {
    const reference =
      window.prompt(
        "Bank / provider payout reference",
        "",
      );

    if (!reference) {
      return;
    }

    const response =
      await fetch(
        `/api/admin/marketplace/payouts/${id}/mark-paid`,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              password,
              payoutReference:
                reference,
            }),
        },
      );

    const body =
      await response.json();

    if (!response.ok) {
      setError(
        body?.error?.message ??
        "Mark paid failed",
      );

      return;
    }

    setError(null);
    await load();
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>
            ADMIN PAYOUTS
          </div>

          <h1>
            Seller Payout Workflow
          </h1>
        </header>

        <section className={styles.card}>
          <label className={styles.field}>
            <span>
              Admin Password
            </span>

            <input
              type="password"
              value={password}
              onChange={
                (event) =>
                  setPassword(
                    event.target.value,
                  )
              }
            />
          </label>

          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          {rows.map(
            (row) => (
              <div
                className={styles.row}
                key={row.id}
              >
                <strong>
                  {row.storeName}
                  {" · "}
                  {toman(
                    row.amountRial,
                  )}
                </strong>

                <span className={styles.meta}>
                  {row.status}
                  {row.payoutReference
                    ? ` · ${row.payoutReference}`
                    : ""}
                </span>

                <div className={styles.actions}>
                  {row.status ===
                    "REQUESTED" && (
                    <>
                      <button
                        className={styles.button}
                        type="button"
                        onClick={
                          () =>
                            void review(
                              row.id,
                              "APPROVE",
                            )
                        }
                      >
                        Approve
                      </button>

                      <button
                        className={styles.danger}
                        type="button"
                        onClick={
                          () =>
                            void review(
                              row.id,
                              "REJECT",
                            )
                        }
                      >
                        Reject
                      </button>
                    </>
                  )}

                  {row.status ===
                    "APPROVED" && (
                    <button
                      className={styles.button}
                      type="button"
                      onClick={
                        () =>
                          void markPaid(
                            row.id,
                          )
                      }
                    >
                      Mark Paid
                    </button>
                  )}
                </div>
              </div>
            ),
          )}
        </section>
      </div>
    </main>
  );
}