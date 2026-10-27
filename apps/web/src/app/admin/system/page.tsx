"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./system.module.css";

type Health = { sampledAt: string; uptimeSeconds: number; load1m: number; memoryTotalBytes: number; memoryFreeBytes: number; diskTotalBytes: number; diskFreeBytes: number; services: Record<string, boolean> };
const serviceNames: Record<string, string> = { api: "رابط برنامه", database: "پایگاه داده", web: "سایت", vtt: "بازی", voice: "ارتباط صوتی" };
const bytes = (n: number) => `${new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(n / 1024 ** 3)} گیگابایت`;

export default function SystemPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/system/health", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "دریافت وضعیت سرور انجام نشد.");
      setHealth(body.data as Health);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "دریافت وضعیت سرور انجام نشد."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}><Link href="/admin">← داشبورد مدیریت</Link><span>وضعیت VPS</span><h1>سلامت سایت و بازی</h1><p>نمایش خواندنی وضعیت سرویس‌ها و منابع سرور. برای تازه‌سازی، دکمهٔ زیر را بزن.</p><button onClick={() => void load()} disabled={loading}>{loading ? "در حال بررسی…" : "تازه‌سازی وضعیت"}</button></header>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {health && <><section className={styles.grid} aria-label="سرویس‌ها">{Object.entries(serviceNames).map(([key, name]) => <article className={styles.card} key={key}><small>{name}</small><strong className={health.services[key] ? styles.ok : styles.fail}>{health.services[key] ? "فعال" : "نیازمند بررسی"}</strong></article>)}</section>
      <section className={styles.grid} aria-label="منابع سرور"><article className={styles.card}><small>حافظهٔ آزاد</small><strong>{bytes(health.memoryFreeBytes)}</strong><span>از {bytes(health.memoryTotalBytes)}</span></article><article className={styles.card}><small>فضای دیسک آزاد</small><strong>{bytes(health.diskFreeBytes)}</strong><span>از {bytes(health.diskTotalBytes)}</span></article><article className={styles.card}><small>زمان روشن بودن سرور</small><strong>{new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 }).format(health.uptimeSeconds / 86400)} روز</strong><span>بار یک‌دقیقه‌ای: {new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 2 }).format(health.load1m)}</span></article></section>
      <p className={styles.timestamp}>آخرین بررسی: {new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(health.sampledAt))}</p></>}
  </div></main>;
}
