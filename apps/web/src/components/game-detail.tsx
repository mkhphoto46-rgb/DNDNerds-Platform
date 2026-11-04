"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import styles from "./game-hub.module.css";
import { CoverImage, Reactions, Reviews, type FeedbackSummary, type FeedbackReview } from "./discovery";
import { useVisibleRefresh } from "@/lib/use-visible-refresh";
import { apiErrorMessage } from "@/lib/api-error";

type Detail = FeedbackSummary & { hostPublicId: string; genres: string[]; imageData: string | null; id: string; title: string; description: string; system: string; language: string; playStyle: string; levelRange: string; schedule: string; capacity: number; hostName: string | null; hostBio: string | null; reviews: FeedbackReview[]; canReview: boolean };

async function request<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(`/api/game-hub/${path}`, { method, cache: "no-store", headers: data ? { "Content-Type": "application/json" } : undefined, body: data ? JSON.stringify(data) : undefined });
  const body = await response.json();
  if (!response.ok) throw new Error(apiErrorMessage(body, "درخواست انجام نشد.", response.status));
  return body.data as T;
}

export function GameDetail({ tableId }: { tableId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const next = await request<Detail>(`tables/${tableId}`);
      setDetail(next);
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "کمپین بارگذاری نشد."); }
    finally { setLoading(false); }
  }, [tableId]);
  useVisibleRefresh(load);
  async function join() {
    setBusy(true); setError("");
    try { const result = await request<{ url: string }>(`tables/${tableId}/launch`, "POST", { role: "player" }); window.location.assign(result.url); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "ورود به بازی انجام نشد."); setBusy(false); }
  }
  return <main className={styles.page}><div className="shell"><Link className={styles.backLink} href="/find-game">← بازگشت به بازی‌ها</Link>
    {loading && <p role="status">در حال بارگذاری…</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {detail && <>
      <header className={styles.detailHero}>{detail.imageData && <div className={styles.heroCover}><CoverImage src={detail.imageData} title={detail.title} /></div>}<span className="section-kicker">{detail.system} · {detail.language} · {detail.levelRange}</span><h1>{detail.title}</h1><p>کمپین به میزبانی {detail.hostName || "DM"}</p><div className={styles.meta}><span>{detail.playStyle}</span><span>ظرفیت: {detail.capacity}</span><span>زمان: {detail.schedule}</span></div></header>
      <div className={styles.detailLayout}><section className={styles.panel}><h2>دربارهٔ کمپین</h2><div className={styles.genreTags}>{detail.genres.map(value => <span key={value}>{value}</span>)}</div><p className={styles.longText}>{detail.description || "DM هنوز توضیحی برای این کمپین ننوشته است."}</p><button disabled={busy} onClick={() => void join()}>ورود به بازی با نمای Player</button><p className={styles.hint}>برای ورود به بازی باید با حساب سایت وارد شده باشی.</p></section>
      <aside className={styles.panel}><h2>دربارهٔ Dungeon Master</h2><h3><Link href={`/dm/${detail.hostPublicId}`}>{detail.hostName || "میزبان"}</Link></h3><p>{detail.hostBio || "این DM هنوز معرفی خود را ثبت نکرده است."}</p></aside></div>
      <section className={styles.panel}><h2>بازخورد بازیکنان دربارهٔ این کمپین</h2><p className={styles.hint}>نظر و پسند این کمپین مستقل از صفحهٔ DM ثبت می‌شود.</p><Reactions target={`tables/${tableId}`} summary={detail} /><Reviews key={tableId} target={`tables/${tableId}`} reviews={detail.reviews} canReview={detail.canReview} /></section>
    </>}
  </div></main>;
}
