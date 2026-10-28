"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { profileRequest } from "@/lib/profile-pages";
import styles from "@/components/profile-pages.module.css";

type DmPage = {
  profile: { userId: string; displayName: string; bio: string; playStyle: string; languages: string; experienceYears: number; avatarData: string | null; bannerData: string | null };
  rating: number | null; reviewCount: number;
  reviews: { id: string; rating: number; comment: string; createdAt: string; reviewerUserId: string; reviewerName: string; tableTitle: string }[];
  tables: { id: string; title: string; status: string; system: string; levelRange: string }[];
};

export default function DmPublicPage({ userId }: { userId: string }) {
  const [page, setPage] = useState<DmPage | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void profileRequest<DmPage>(`dms/${encodeURIComponent(userId)}/page`).then(setPage).catch(reason => setError(reason.message)); }, [userId]);
  return <main className={styles.page}><div className={styles.shell}>
    <div className={styles.actions}><Link href="/find-dm">همهٔ DMها ←</Link><Link href="/find-game">پیدا کردن بازی ←</Link></div>
    {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    {!page && !error && <p role="status">در حال بارگذاری صفحهٔ DM…</p>}
    {page && <>
      {page.profile.bannerData && <img className={styles.banner} src={page.profile.bannerData} alt={`بنر ${page.profile.displayName}`} />}
      <div className={styles.identity}>{page.profile.avatarData && <img className={styles.avatar} src={page.profile.avatarData} alt={`آواتار ${page.profile.displayName}`} />}<div><small>Dungeon Master</small><h1>{page.profile.displayName}</h1><p className={styles.stars}>★ {page.rating ?? "بدون امتیاز"} · {page.reviewCount} نظر</p></div></div>
      <section className={styles.card}><h2>دربارهٔ DM</h2><p>{page.profile.bio || "این DM هنوز معرفی ننوشته است."}</p><div className={styles.tags}><span>{page.profile.playStyle}</span><span>{page.profile.languages}</span><span>{page.profile.experienceYears} سال تجربه</span></div></section>
      <section className={styles.card}><h2>بازی‌ها و میزها</h2><div className={styles.grid}>{page.tables.map(table => <article className={styles.card} key={table.id}><h3>{table.title}</h3><div className={styles.tags}><span>{table.system}</span><span>سطح {table.levelRange}</span><span>{table.status === "PUBLISHED" ? "در حال پذیرش" : "پایان‌یافته"}</span></div>{table.status === "PUBLISHED" && <Link href={`/find-game/${table.id}`}>جزئیات و پیوستن ←</Link>}</article>)}</div>{!page.tables.length && <p className={styles.muted}>هنوز میز عمومی ثبت نشده است.</p>}</section>
      <section className={styles.card}><h2>نظر بازیکنان</h2>{page.reviews.map(review => <article className={styles.review} key={review.id}><div className={styles.stars}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</div><p>{review.comment}</p><small><Link href={`/player/${review.reviewerUserId}`}>{review.reviewerName}</Link> · {review.tableTitle} · {new Date(review.createdAt).toLocaleDateString("fa-IR")}</small></article>)}{!page.reviews.length && <p className={styles.muted}>هنوز نظری برای بازی‌های این DM ثبت نشده است.</p>}</section>
    </>}
  </div></main>;
}
