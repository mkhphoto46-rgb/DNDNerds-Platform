"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { invalidateDiscovery } from "@/lib/use-visible-refresh";
import styles from "./discovery.module.css";

export type FeedbackSummary = { likes?: number; dislikes?: number; myVote?: 1 | -1 | null; canReact?: boolean; reviewCount?: number };
export type FeedbackReview = { id: string; author: string; authorId?: string; comment: string; mine?: boolean; createdAt?: string; updatedAt?: string };
export async function discoveryRequest<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(`/api/game-hub/${path}`, { method, credentials: "same-origin", cache: "no-store", headers: data !== undefined ? { "Content-Type": "application/json" } : undefined, body: data !== undefined ? JSON.stringify(data) : undefined });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? "درخواست انجام نشد.");
  return body.data as T;
}

export function Reactions({ target, summary }: { target: string; summary: FeedbackSummary }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [local, setLocal] = useState(summary);
  useEffect(() => setLocal(summary), [summary]);
  async function vote(value: 1 | -1) {
    setBusy(true); setError("");
    try { const next = await discoveryRequest<FeedbackSummary>(`${target}/reaction`, "PUT", { value: local.myVote === value ? null : value }); setLocal(next); invalidateDiscovery(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "ثبت بازخورد ناموفق بود."); }
    finally { setBusy(false); }
  }
  return <div className={styles.feedback}><div className={styles.reactions} aria-label="بازخورد بازیکنان">
    <button type="button" disabled={busy || !local.canReact} aria-pressed={local.myVote === 1} onClick={() => void vote(1)} title={local.canReact ? "پسندیدن؛ برای برداشتن دوباره بزن" : "برای ثبت بازخورد، با حساب فعال وارد شو؛ به خودت نمی‌توانی رأی بدهی"}><span aria-hidden="true">↑</span> پسند <b>{local.likes ?? 0}</b></button>
    <button type="button" disabled={busy || !local.canReact} aria-pressed={local.myVote === -1} onClick={() => void vote(-1)} title={local.canReact ? "نپسندیدن؛ برای برداشتن دوباره بزن" : "برای ثبت بازخورد، با حساب فعال وارد شو؛ به خودت نمی‌توانی رأی بدهی"}><span aria-hidden="true">↓</span> نپسند <b>{local.dislikes ?? 0}</b></button>
    <span className={styles.commentCount}>{local.reviewCount ?? 0} نظر</span>
  </div>{error && <p role="alert">{error}</p>}</div>;
}

export function Reviews({ target, reviews, canReview }: { target: string; reviews: FeedbackReview[]; canReview: boolean }) {
  const mine = reviews.find(review => review.mine);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const dirty = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (!dirty.current) setComment(mine?.comment ?? ""); }, [mine?.comment]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    try { await discoveryRequest(`${target}/review`, "PUT", { comment: comment.trim() }); dirty.current = false; setMessage("نظرت ذخیره شد."); invalidateDiscovery(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "ثبت نظر ناموفق بود."); }
    finally { setBusy(false); }
  }
  return <div className={styles.reviews}>
    {reviews.length ? reviews.map(review => <article className={styles.review} key={review.id}><strong>{review.authorId ? <Link href={`/player/${review.authorId}`}>{review.author}</Link> : review.author}{review.mine && " · نظر شما"}</strong><p>{review.comment}</p>{(review.updatedAt || review.createdAt) && <time dateTime={review.updatedAt || review.createdAt}>{new Date((review.updatedAt || review.createdAt)!).toLocaleDateString("fa-IR")}</time>}</article>) : <p className={styles.muted}>هنوز نظری ثبت نشده است. اولین تجربه را بنویس.</p>}
    {canReview ? <form className={styles.reviewForm} onSubmit={event => void submit(event)}><label>{mine ? "ویرایش نظر خودت" : "نظر شما"}<textarea required minLength={3} maxLength={1200} value={comment} onChange={event => { dirty.current = true; setComment(event.target.value); }} placeholder="تجربه‌ات را با دیگر بازیکنان در میان بگذار" /></label><small>۳ تا ۱۲۰۰ نویسه · ثبت نظر مستقل از پسندیدن است.</small><button disabled={busy || comment.trim().length < 3}>{busy ? "در حال ذخیره…" : "ذخیرهٔ نظر"}</button></form> : <p className={styles.muted}>برای نوشتن نظر با حساب فعال وارد شو. امکان نظر دادن به خودت وجود ندارد.</p>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </div>;
}

export function CoverImage({ src, title, banner = false }: { src?: string | null; title: string; banner?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { dialog.current?.close(); trigger.current?.focus(); };
  return <><button ref={trigger} type="button" className={`${styles.cover} ${banner ? styles.bannerCover : ""}`} aria-label={`بزرگ‌نمایی تصویر ${title}`} disabled={!src} onClick={() => dialog.current?.showModal()}>{src ? <img src={src} alt={`تصویر ${title}`} loading="lazy" /> : <span className={styles.coverPlaceholder}><span aria-hidden="true">◇</span><small>{title}</small></span>}{src && <span className={styles.zoomHint}>بزرگ‌نمایی ↗</span>}</button>
    {src && <dialog ref={dialog} className={styles.imageDialog} aria-label={`تصویر بزرگ ${title}`} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}><button type="button" onClick={close} autoFocus aria-label="بستن تصویر">بستن ×</button><img src={src} alt={`تصویر بزرگ ${title}`} /></dialog>}
  </>;
}

export function RecentReviews({ reviews = [] }: { reviews?: FeedbackReview[] }) {
  return reviews.length > 0 ? <div className={styles.recentReviews}><small>تازه‌ترین نظرها</small>{reviews.slice(0, 2).map(review => <blockquote key={review.id}><p>{review.comment}</p><cite>{review.author}</cite></blockquote>)}</div> : <p className={styles.noReviews}>هنوز نظری ثبت نشده است.</p>;
}

export function DmCard({ profile }: { profile: FeedbackSummary & { userId: string; displayName: string; username?: string | null; publicId?: string; bio: string; avatarData?: string | null; bannerData?: string | null; playStyle: string; languages: string; experienceYears: number; recentReviews?: FeedbackReview[] } }) {
  return <article className={styles.dmCard}><CoverImage src={profile.bannerData} title={`بنر ${profile.displayName}`} banner /><div className={styles.dmBody}><div className={styles.dmIdentity}>{profile.avatarData ? <img className={styles.avatar} src={profile.avatarData} alt={`آواتار ${profile.displayName}`} /> : <span className={styles.avatarFallback} aria-hidden="true">{profile.displayName.slice(0, 1)}</span>}<div><small>Dungeon Master</small><h2><Link href={`/dm/${profile.userId}`}>{profile.displayName}</Link></h2><small dir="ltr">{profile.username ?? profile.publicId ?? ""}</small></div></div><p className={styles.bio}>{profile.bio || "این DM هنوز معرفی کوتاهی ننوشته است."}</p><div className={styles.tags}><span>{profile.playStyle}</span><span>{profile.languages}</span><span>{profile.experienceYears} سال تجربه</span></div><Reactions target={`dms/${profile.userId}`} summary={profile} /><RecentReviews reviews={profile.recentReviews} /><Link className={styles.cardLink} href={`/dm/${profile.userId}`}>معرفی، میزها و نظرها ←</Link></div></article>;
}

export function DeleteCampaign({ id, title, pending, onDeleted }: { id: string; title: string; pending?: boolean; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(Boolean(pending));
  const [error, setError] = useState("");
  async function remove() {
    setBusy(true); setError("");
    try { const result = await discoveryRequest<{ deleted?: boolean; deletionPending?: boolean }>(`tables/${id}`, "DELETE", { confirmTitle }); if (result.deleted) { setOpen(false); onDeleted(); } else { setWaiting(true); } invalidateDiscovery(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "حذف میز انجام نشد."); }
    finally { setBusy(false); }
  }
  return <div className={styles.deleteArea}>{!open ? <button className={styles.danger} type="button" onClick={() => setOpen(true)}>{waiting ? "پیگیری حذف میز" : "حذف میز"}</button> : <div className={styles.deleteConfirm}><strong>حذف «{title}»</strong><p>میز، داده‌های بازی، اعضا، درخواست‌ها و بازخوردهای همین کمپین حذف می‌شوند. این کار قابل بازگشت نیست.</p>{waiting && <p role="status">حذف در حال تکمیل است؛ میز برای ورود بسته شده. می‌توانی دوباره تلاش کنی.</p>}<label>برای تأیید، عنوان میز را دقیق بنویس<input autoComplete="off" value={confirmTitle} onChange={event => setConfirmTitle(event.target.value)} /></label><div><button type="button" className={styles.danger} disabled={busy || confirmTitle !== title} onClick={() => void remove()}>{busy ? "در حال حذف…" : waiting ? "تلاش دوباره برای تکمیل حذف" : "حذف دائمی میز"}</button><button type="button" disabled={busy} onClick={() => setOpen(false)}>انصراف</button></div>{error && <p role="alert">{error}</p>}</div>}</div>;
}
