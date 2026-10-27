"use client";

import Link from "next/link";
import { useState } from "react";
import styles from "./subscriptions.module.css";

type Grant = { id: string; email: string; startsAt: string; endsAt: string; revokedAt: string | null; reason: string; createdAt: string };
type Result = { data: { priceRial: number; account: { id: string; email: string; emailVerified: boolean; status: string } | null; grants: Grant[] } };
const formatDate = (value: string) => new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(value));

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? "درخواست انجام نشد.");
  return body as T;
}

export default function SubscriptionsPage() {
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<Result["data"] | null>(null);
  const [end, setEnd] = useState("");
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [priceToman, setPriceToman] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    const data = (await request<Result>(`/api/admin/subscriptions?email=${encodeURIComponent(email.trim().toLowerCase())}`)).data;
    setResult(data);
    setPriceToman(String(data.priceRial / 10));
  }

  async function action(kind: "grant" | "revoke" | "price") {
    setError(""); setNotice("");
    if (!password || reason.trim().length < 3) { setError("رمز مدیر و دلیل تغییر را وارد کن."); return; }
    if (kind !== "price" && !email.trim()) { setError("ایمیل حساب را وارد کن."); return; }
    if (kind === "grant" && (!end || new Date(end).getTime() <= Date.now())) { setError("تاریخ پایان باید در آینده باشد."); return; }
    setBusy(true);
    try {
      const body = kind === "price" ? { priceToman: Number(priceToman), password, reason } :
        kind === "grant" ? { email: email.trim(), endsAt: new Date(end).toISOString(), password, reason } : { email: email.trim(), password, reason };
      await request(`/api/admin/subscriptions/${kind === "grant" ? "grants" : kind === "revoke" ? "revoke" : "price"}`, {
        method: kind === "price" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      setPassword(""); setReason("");
      setNotice(kind === "grant" ? "دسترسی ثبت شد." : kind === "revoke" ? "دسترسی‌های دستی فعال قطع شدند." : "قیمت دوره‌های آینده ثبت شد.");
      await load();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "تغییر انجام نشد."); }
    finally { setBusy(false); }
  }

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}><Link href="/admin">← داشبورد مدیریت</Link><span>اشتراک بازی</span><h1>مدیریت دسترسی بازی</h1><p>دسترسی دستی را برای یک ایمیل ثبت یا قطع کن و قیمت دوره‌های بعدی را تغییر بده. این بخش فقط برای مدیر اصلی باز است.</p></header>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    <section className={styles.card}><h2>پیدا کردن حساب</h2><form onSubmit={event => { event.preventDefault(); void load().catch(failure => setError(failure instanceof Error ? failure.message : "جستجو انجام نشد.")); }}><label>ایمیل<input type="email" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} placeholder="name@example.com" required /></label><button type="submit">جستجو</button></form>
      {result && <><p>{result.account ? `حساب: ${result.account.email} · ${result.account.status} · ${result.account.emailVerified ? "ایمیل تأیید شده" : "ایمیل تأیید نشده"}` : "حساب فعلاً ثبت نشده است؛ هدیهٔ این ایمیل پس از ثبت‌نام و تأیید ایمیل قابل دریافت خواهد بود."}</p><h3>دوره‌های دستی</h3>{result.grants.length ? <div className={styles.grants}>{result.grants.map(grant => <article key={grant.id}><strong>{grant.revokedAt ? "قطع شده" : new Date(grant.endsAt).getTime() > Date.now() ? "فعال" : "پایان یافته"}</strong><span>تا {formatDate(grant.endsAt)}</span><small>{grant.reason}</small></article>)}</div> : <p>دوره‌ای برای این ایمیل ثبت نشده است.</p>}</>}
    </section>
    <section className={styles.card}><h2>تغییر دسترسی</h2><p>برای هر تغییر، رمز حساب مدیر اصلی و دلیل آن لازم است. حساب‌های فعلی بدون اقدام شما تغییر نمی‌کنند.</p><div className={styles.fields}><label>پایان دسترسی دستی<input type="datetime-local" value={end} onChange={event => setEnd(event.target.value)} /></label><label>دلیل تغییر<input value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={500} /></label><label>رمز مدیر<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label></div><div className={styles.actions}><button disabled={busy} onClick={() => void action("grant")}>دادن دسترسی تا تاریخ انتخابی</button><button disabled={busy} className={styles.danger} onClick={() => void action("revoke")}>قطع دسترسی‌های دستی فعال</button></div></section>
    <section className={styles.card}><h2>قیمت اشتراک ۳۰ روزه</h2><p>قیمت جدید برای دوره‌های بعدی نمایش داده می‌شود. پرداخت آنلاین هنوز فعال نیست.</p><label>قیمت به تومان<input type="number" min="1" value={priceToman} onChange={event => setPriceToman(event.target.value)} /></label><button disabled={busy || !result} onClick={() => void action("price")}>ثبت قیمت جدید</button></section>
  </div></main>;
}
