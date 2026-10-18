"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import styles from "../seller-dashboard.module.css";

type Dashboard = {
  stores: Array<{ storeId: string; name: string; role: string }>;
};
type PayoutData = {
  store: { id: string; name: string };
  balance: { pendingRial: number; availableRial: number; paidOutRial: number };
  payouts: Array<{ id: string; amountRial: number; status: string; payoutReference: string | null; requestedAt: string }>;
};
type StoreOption = { storeId: string; name: string; role: string };

class PayoutHttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
async function readApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...options });
  const raw = await response.text();
  let body: { error?: { message?: string } } = {};
  try { body = JSON.parse(raw) as typeof body; } catch { /* unexpected upstream body */ }
  if (!response.ok) {
    if (response.status === 401) throw new PayoutHttpError(401, "نشست ورود معتبر نیست؛ دوباره وارد حساب شو.");
    if (response.status === 403) throw new PayoutHttpError(403, "فقط مالک یا مدیر مجاز فروشگاه به تسویه‌ها دسترسی دارد.");
    throw new PayoutHttpError(response.status, body.error?.message || `خطای سرور: HTTP ${response.status}`);
  }
  return body as T;
}
function tomanFromRial(value: number) {
  return new Intl.NumberFormat("fa-IR").format(Math.trunc(value / 10)) + " تومان";
}

export default function SellerPayoutsPage() {
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeId, setStoreId] = useState("");
  const [data, setData] = useState<PayoutData | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  function showError(reason: unknown) {
    if (reason instanceof PayoutHttpError && reason.status === 401) {
      setNeedsLogin(true);
      setData(null);
    }
    setError(reason instanceof Error ? reason.message : "دریافت اطلاعات ناموفق بود.");
  }

  async function load(id: string) {
    const result = await readApi<PayoutData>(`/api/seller/stores/${encodeURIComponent(id)}/payouts`);
    setData(result);
    setNeedsLogin(false);
  }

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const dashboard = await readApi<Dashboard>("/api/seller/dashboard");
        if (cancelled) return;
        const eligible = (dashboard.stores || []).filter((item) =>
          item.role === "OWNER" || item.role === "MANAGER",
        );
        setStores(eligible);
        if (eligible.length === 0) {
          setError("فروشگاه دارای مجوز مدیریت تسویه پیدا نشد.");
          return;
        }
        const id = eligible[0].storeId;
        setStoreId(id);
        const payoutInfo = await readApi<PayoutData>(`/api/seller/stores/${encodeURIComponent(id)}/payouts`);
        if (!cancelled) { setData(payoutInfo); setNeedsLogin(false); }
      } catch (reason) {
        if (!cancelled) showError(reason);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void start();
    return () => { cancelled = true; };
  }, []);

  async function changeStore(id: string) {
    if (busy) return;
    setStoreId(id); setData(null); setAmount(""); setError(null); setLoading(true);
    try { await load(id); }
    catch (reason) { showError(reason); }
    finally { setLoading(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || loading || needsLogin || !data || !storeId) return;
    const amountRial = Number(amount);
    if (!Number.isSafeInteger(amountRial) || amountRial < 10000 || amountRial > 2_000_000_000) {
      setError("مبلغ باید عدد صحیح بین ۱۰٬۰۰۰ و ۲٬۰۰۰٬۰۰۰٬۰۰۰ ریال باشد.");
      return;
    }
    if (amountRial > data.balance.availableRial) {
      setError("مبلغ درخواستی از موجودی قابل برداشت بیشتر است.");
      return;
    }
    setBusy(true); setError(null);
    try {
      await readApi(`/api/seller/stores/${encodeURIComponent(storeId)}/payouts`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountRial }),
      });
      setAmount("");
      await load(storeId);
    } catch (reason) { showError(reason); }
    finally { setBusy(false); }
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>SELLER PAYOUTS</div>
          <h1>درخواست تسویه</h1>
          <Link className={styles.secondary} href="/seller/dashboard">بازگشت به داشبورد</Link>
        </header>
        {loading && <p className={styles.notice}>در حال دریافت اطلاعات تسویه…</p>}
        {error && <div className={styles.error} role="alert">{error}</div>}
        {needsLogin && <div className={styles.notice} role="status">
          <Link href="/login?next=%2Fseller%2Fpayouts">ورود مجدد به حساب</Link>
        </div>}
        {stores.length > 1 && !needsLogin && (
          <section className={styles.card}>
            <label className={styles.field}><span>انتخاب فروشگاه</span>
              <select value={storeId} disabled={busy || loading} onChange={(event) => { void changeStore(event.target.value); }}>
                {stores.map((item) => <option key={item.storeId} value={item.storeId}>{item.name}</option>)}
              </select>
            </label>
          </section>
        )}
        {data && !needsLogin && (
          <section className={styles.card}>
            <h2>{data.store.name}</h2>
            <div className={styles.stats}>
              <div className={styles.stat}><small>در انتظار</small><strong>{tomanFromRial(data.balance.pendingRial)}</strong></div>
              <div className={styles.stat}><small>قابل برداشت</small><strong>{tomanFromRial(data.balance.availableRial)}</strong></div>
              <div className={styles.stat}><small>تسویه‌شده</small><strong>{tomanFromRial(data.balance.paidOutRial)}</strong></div>
            </div>
            <form className={styles.form} onSubmit={submit}>
              <label className={styles.field}><span>مبلغ (ریال)</span>
                <input type="number" min="10000" max="2000000000" step="1" value={amount}
                  onChange={(event) => setAmount(event.target.value)} disabled={busy} required />
              </label>
              <button className={styles.button} type="submit" disabled={busy || loading || data.balance.availableRial < 10000}>
                {busy ? "در حال ثبت…" : "ثبت درخواست تسویه"}
              </button>
            </form>
            <h3>تاریخچه</h3>
            {data.payouts.length === 0 && <p className={styles.notice}>هنوز درخواستی ثبت نشده است.</p>}
            {data.payouts.map((payout) => (
              <div className={styles.row} key={payout.id}>
                <strong>{tomanFromRial(payout.amountRial)}</strong>
                <span className={styles.meta}>{payout.status}{payout.payoutReference ? ` · ${payout.payoutReference}` : ""}</span>
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
