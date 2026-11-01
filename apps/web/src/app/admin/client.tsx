"use client";
import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import styles from "../seller/seller-dashboard.module.css";



type Overview = {
  admin: {
    email: string;
    role: string;
  };
  config: {
    defaultCommissionBps: number;
  };
  counts: {
    stores: number;
    pendingSellers: number;
  };
  stores: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
  }>;
  pendingSellers: Array<{
    id: string;
    displayName: string;
    email: string;
    status: string;
  }>;
};

export default function AdminPage() {
  const [pendingAccounts, setPendingAccounts] = useState<Array<{ id: string; email: string }>>([]);
  const [data,setData] =
    useState<Overview | null>(null);

  const [error,setError] =
    useState<string | null>(null);

  const [password,setPassword] =
    useState("");

  const [commission,setCommission] =
    useState("");

  async function load() {
    const response =
      await fetch(
        "/api/admin/marketplace/overview",
        { cache: "no-store" },
      );

    const body =
      await response.json();

    if (!response.ok) {
      throw new Error(
        body?.error?.message ??
        "Admin access failed",
      );
    }

    setData(body as Overview);
    const pendingResponse = await fetch("/api/admin/accounts/pending", { cache: "no-store" });
    if (pendingResponse.ok) {
      const pendingBody = await pendingResponse.json();
      setPendingAccounts(pendingBody.data ?? []);
    }
    setCommission(
      String(
        body.config.defaultCommissionBps,
      ),
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
                : "Admin load failed",
            ),
        );
    },
    [],
  );

  async function moderate(
    sellerId: string,
    action:
      | "APPROVE"
      | "SUSPEND"
      | "REJECT",
  ) {
    const response =
      await fetch(
        `/api/admin/marketplace/sellers/${sellerId}/moderate`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body:
            JSON.stringify({
              action,
              password,
              reason:
                `Admin Console ${action}`,
            }),
        },
      );

    const body =
      await response.json();

    if (!response.ok) {
      setError(
        body?.error?.message ??
        "Moderation failed",
      );
      return;
    }

    setError(null);
    await load();
  }

  async function approveAccount(userId: string) {
    const response = await fetch(`/api/admin/accounts/${userId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body?.error?.message ?? "تأیید حساب انجام نشد");
      return;
    }
    setError(null);
    await load();
  }

  async function saveGlobalCommission() {
    const response =
      await fetch(
        "/api/admin/marketplace/config/commission",
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body:
            JSON.stringify({
              commissionBps:
                Number(commission),
              password,
              reason:
                "Admin Console global commission update",
            }),
        },
      );

    const body =
      await response.json();

    if (!response.ok) {
      setError(
        body?.error?.message ??
        "Commission update failed",
      );
      return;
    }

    setError(null);
    await load();
  }

  async function setStoreCommission(
    storeId: string,
    storeName: string,
  ) {
    const raw =
      window.prompt(
        `Commission BPS برای ${storeName}. خالی = Global`,
        "",
      );

    if (raw === null) {
      return;
    }

    const response =
      await fetch(
        `/api/admin/marketplace/stores/${storeId}/commission`,
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body:
            JSON.stringify({
              commissionBps:
                raw.trim() === ""
                  ? null
                  : Number(raw),
              password,
              reason:
                "Admin Console store override",
            }),
        },
      );

    const body =
      await response.json();

    if (!response.ok) {
      setError(
        body?.error?.message ??
        "Store commission update failed",
      );
      return;
    }

    setError(null);
  }

  if (!data) {
    return (
      <main className={styles.page}>
        <div className={styles.shell}>
          <div className={
            error
              ? styles.error
              : styles.notice
          }>
            {error ??
              "در حال بارگذاری Admin Console..."}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>
            DND NERDS ADMIN
          </div>
          <h1>
            داشبورد مدیریت سایت
          </h1>
          <Link href="/admin/game-hub">مدیریت میزها، Dungeon Masters و آرنا ←</Link>
          <Link href="/admin/accounts">مدیریت حساب‌ها و دسترسی کاربران ←</Link>
          <Link href="/admin/feedback">انتقادها، نظرها و پیشنهادهای کاربران ←</Link>
          {data.admin.role === "SUPER_ADMIN" && <Link href="/admin/subscriptions">مدیریت اشتراک و دسترسی بازی ←</Link>}
          {data.admin.role === "SUPER_ADMIN" && <Link href="/admin/system">وضعیت سایت، بازی و سرور ←</Link>}
          <div className={styles.meta}>
            {data.admin.email}
            {" · "}
            {data.admin.role}
          </div>
        </header>

        {error && (
          <div className={styles.error}>
            {error}
          </div>
        )}

        <div className={styles.grid}>
          <section className={styles.card}>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <small>Stores</small>
                <strong>
                  {data.counts.stores}
                </strong>
              </div>

              <div className={styles.stat}>
                <small>Pending Sellers</small>
                <strong>
                  {data.counts.pendingSellers}
                </strong>
              </div>

              <div className={styles.stat}>
                <small>Global Commission</small>
                <strong>
                  {(data.config.defaultCommissionBps / 100).toFixed(2)}%
                </strong>
              </div>

              <div className={styles.stat}>
                <small>Sensitive Actions</small>
                <strong>
                  Re-auth
                </strong>
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <h2>
              Admin Re-authentication
            </h2>
            <input
              className={styles.input}
              type="password"
              placeholder="Admin password"
              value={password}
              onChange={
                (event) =>
                  setPassword(
                    event.target.value,
                  )
              }
            />
          </section>

          <section className={styles.card}>
            <h2>درخواست‌های عضویت</h2>
            {pendingAccounts.length === 0 && <p>درخواستی در انتظار تأیید نیست.</p>}
            {pendingAccounts.map((account) => (
              <div className={styles.actions} key={account.id}>
                <span>{account.email}</span>
                <button className={styles.button} type="button" onClick={() => void approveAccount(account.id)} disabled={!password}>تأیید حساب</button>
              </div>
            ))}
          </section>

          <section className={styles.card}>
            <h2>
              Global Platform Commission
            </h2>
            <div className={styles.actions}>
              <input
                className={styles.input}
                type="number"
                min="0"
                max="3000"
                value={commission}
                onChange={
                  (event) =>
                    setCommission(
                      event.target.value,
                    )
                }
              />
              <button
                className={styles.button}
                type="button"
                onClick={
                  () =>
                    void saveGlobalCommission()
                }
              >
                Save BPS
              </button>
            </div>
            <p className={styles.meta}>
              500 BPS = 5% Platform Commission. این Tax نیست.
            </p>
          </section>

          <section className={styles.card}>
            <h2>
              Pending Seller Review
            </h2>

            {data.pendingSellers.map(
              (seller) => (
                <div
                  key={seller.id}
                  className={styles.row}
                >
                  <strong>
                    {seller.displayName}
                  </strong>
                  <span className={styles.meta}>
                    {seller.email}
                  </span>
                  <div className={styles.actions}>
                    <button
                      className={styles.button}
                      type="button"
                      onClick={
                        () =>
                          void moderate(
                            seller.id,
                            "APPROVE",
                          )
                      }
                    >
                      Approve
                    </button>

                    <button
                      className={styles.secondary}
                      type="button"
                      onClick={
                        () =>
                          void moderate(
                            seller.id,
                            "SUSPEND",
                          )
                      }
                    >
                      Suspend
                    </button>

                    <button
                      className={styles.danger}
                      type="button"
                      onClick={
                        () =>
                          void moderate(
                            seller.id,
                            "REJECT",
                          )
                      }
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ),
            )}
          </section>

          <section className={styles.card}>
            <h2>
              Store Commission Overrides
            </h2>

            {data.stores.map(
              (store) => (
                <div
                  key={store.id}
                  className={styles.row}
                >
                  <strong>
                    {store.name}
                  </strong>
                  <span className={styles.meta}>
                    {store.slug}
                    {" · "}
                    {store.status}
                  </span>
                  <button
                    className={styles.secondary}
                    type="button"
                    onClick={
                      () =>
                        void setStoreCommission(
                          store.id,
                          store.name,
                        )
                    }
                  >
                    Set / Clear Override
                  </button>
                </div>
              ),
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
