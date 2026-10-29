"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "./game-hub.module.css";

type Review = { id: string; rating: number; comment: string; author: string; mine: boolean; updatedAt: string };
type Detail = { hostUserId: string; genres: string[]; imageData: string | null; id: string; title: string; description: string; system: string; language: string; playStyle: string; levelRange: string; schedule: string; capacity: number; hostName: string | null; hostBio: string | null; rating: number | null; reviewCount: number; reviews: Review[]; canReview: boolean };

async function request<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(`/api/game-hub/${path}`, { method, cache: "no-store", headers: data ? { "Content-Type": "application/json" } : undefined, body: data ? JSON.stringify(data) : undefined });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? "درخواست انجام نشد.");
  return body.data as T;
}

export function GameDetail({ tableId }: { tableId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const load = useCallback(async () => {
    try {
      const next = await request<Detail>(`tables/${tableId}`);
      setDetail(next);
      const mine = next.reviews.find(review => review.mine);
      if (mine) { setRating(mine.rating); setComment(mine.comment); }
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "کمپین بارگذاری نشد."); }
    finally { setLoading(false); }
  }, [tableId]);
  useEffect(() => { void load(); }, [load]);
  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { await request(`tables/${tableId}/review`, "PUT", { rating, comment }); setNotice("نظر و امتیازت ثبت شد."); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "ثبت نظر انجام نشد."); }
    finally { setBusy(false); }
  }
  async function join() {
    setBusy(true); setError("");
    try { const result = await request<{ url: string }>(`tables/${tableId}/launch`, "POST", { role: "player" }); window.location.assign(result.url); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "ورود به بازی انجام نشد."); setBusy(false); }
  }
  return <main className={styles.page}><div className="shell"><Link className={styles.backLink} href="/find-game">← بازگشت به بازی‌ها</Link>
    {loading && <p role="status">در حال بارگذاری…</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {detail && <>
      <header className={styles.detailHero}><span className="section-kicker">{detail.system} · {detail.language} · {detail.levelRange}</span><h1>{detail.title}</h1><p>کمپین به میزبانی {detail.hostName || "DM"}</p><div className={styles.meta}><span>{detail.playStyle}</span><span>ظرفیت: {detail.capacity}</span><span>زمان: {detail.schedule}</span></div></header>
      <div className={styles.detailLayout}><section className={styles.panel}><h2>دربارهٔ کمپین</h2>{detail.imageData && <img className={styles.campaignImage} src={detail.imageData} alt={`تصویر ${detail.title}`}/>}<div className={styles.genreTags}>{detail.genres.map(value => <span key={value}>{value}</span>)}</div><p className={styles.longText}>{detail.description || "DM هنوز توضیحی برای این کمپین ننوشته است."}</p><button disabled={busy} onClick={() => void join()}>ورود به بازی با نمای Player</button><p className={styles.hint}>برای ورود به بازی باید با حساب سایت وارد شده باشی.</p></section>
      <aside className={styles.panel}><h2>دربارهٔ Dungeon Master</h2><h3><Link href={`/dm/${detail.hostUserId}`}>{detail.hostName || "میزبان"}</Link></h3><div className={styles.bigRating}>★ {detail.reviewCount ? detail.rating : "—"} <small>از ۵ · {detail.reviewCount} نظر</small></div><p>{detail.hostBio || "این DM هنوز معرفی خود را ثبت نکرده است."}</p></aside></div>
      <section className={styles.panel}><h2>نظر بازیکنان دربارهٔ این کمپین</h2><p className={styles.hint}>امتیاز DM از نظرهای ثبت‌شده برای همهٔ کمپین‌هایش محاسبه می‌شود.</p>
        {detail.reviews.length ? <div className={styles.reviewList}>{detail.reviews.map(review => <article key={review.id} className={styles.review}><div><strong>{review.author}{review.mine ? " · نظر شما" : ""}</strong><span className={styles.rating}>★ {review.rating} از ۵</span></div><p>{review.comment}</p><small>{new Date(review.updatedAt).toLocaleDateString("fa-IR")}</small></article>)}</div> : <p>هنوز نظری برای این کمپین ثبت نشده است.</p>}
        {detail.canReview && <form className={styles.reviewForm} onSubmit={event => void submitReview(event)}><h3>{detail.reviews.some(review => review.mine) ? "ویرایش نظر خودت" : "ثبت نظر و امتیاز"}</h3><fieldset><legend>امتیاز به DM</legend>{[1, 2, 3, 4, 5].map(value => <button key={value} type="button" className={value <= rating ? styles.starActive : styles.star} aria-label={`${value} ستاره`} aria-pressed={rating === value} onClick={() => setRating(value)}>★</button>)}</fieldset><label>نظر شما<textarea required minLength={10} maxLength={1200} value={comment} onChange={event => setComment(event.target.value)} placeholder="تجربه‌ات از این کمپین و DM را بنویس" /></label><button disabled={busy}>ثبت نظر</button></form>}
        {!detail.canReview && <p className={styles.hint}>بازیکنان عضو این کمپین پس از ورود با حساب سایت می‌توانند نظر و امتیاز ثبت کنند.</p>}
      </section>
    </>}
  </div></main>;
}
