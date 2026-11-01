"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { profileRequest } from "@/lib/profile-pages";
import styles from "@/components/profile-pages.module.css";
import hub from "@/components/game-hub.module.css";
import { CoverImage, Reactions, Reviews, type FeedbackSummary, type FeedbackReview } from "@/components/discovery";
import { useVisibleRefresh } from "@/lib/use-visible-refresh";

type DmPage = FeedbackSummary & { canReview: boolean; campaignReviews?: (FeedbackReview & { tableTitle?: string; reviewerName?: string; reviewerUserId?: string })[];
  profile: { userId: string; displayName: string; bio: string; playStyle: string; languages: string; experienceYears: number; avatarData: string | null; bannerData: string | null };
  reviews: FeedbackReview[];
  tables: { id: string; title: string; status: string; system: string; levelRange: string; description: string; genres: string[]; imageData: string | null }[];
};

export default function DmPublicPage({ userId }: { userId: string }) {
  const [page, setPage] = useState<DmPage | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => { try { setPage(await profileRequest<DmPage>(`dms/${encodeURIComponent(userId)}/page`)); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "بارگذاری انجام نشد."); } }, [userId]);
  useVisibleRefresh(load);
  return <main className={styles.page}><div className={styles.shell}>
    <div className={styles.actions}><Link href="/find-dm">همهٔ DMها ←</Link><Link href="/find-game">پیدا کردن بازی ←</Link></div>
    {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    {!page && !error && <p role="status">در حال بارگذاری صفحهٔ DM…</p>}
    {page && <>
      <div className={hub.dmPageBanner}><CoverImage src={page.profile.bannerData} title={`بنر ${page.profile.displayName}`} banner /></div>
      <div className={styles.identity}>{page.profile.avatarData && <img className={styles.avatar} src={page.profile.avatarData} alt={`آواتار ${page.profile.displayName}`} />}<div><small>Dungeon Master</small><h1>{page.profile.displayName}</h1></div></div>
      <section className={styles.card}><Reactions target={`dms/${userId}`} summary={page} /><h2>دربارهٔ DM</h2><p>{page.profile.bio || "این DM هنوز معرفی ننوشته است."}</p><div className={styles.tags}><span>{page.profile.playStyle}</span><span>{page.profile.languages}</span><span>{page.profile.experienceYears} سال تجربه</span></div></section>
      <section className={styles.card}><h2>بازی‌ها و میزها</h2><div className={hub.gameGrid}>{page.tables.map(table => <article className={hub.gameCard} key={table.id}><CoverImage src={table.imageData} title={table.title} /><div className={hub.gameCardBody}><h3>{table.title}</h3><p>{table.description}</p><div className={styles.tags}>{table.genres.map(value => <span key={value}>{value}</span>)}</div><div className={styles.tags}><span>{table.system}</span><span>سطح {table.levelRange}</span><span>{table.status === "PUBLISHED" ? "در حال پذیرش" : "پایان‌یافته"}</span></div>{table.status === "PUBLISHED" && <Link href={`/find-game/${table.id}`}>جزئیات و پیوستن ←</Link>}</div></article>)}</div>{!page.tables.length && <p className={styles.muted}>هنوز میز عمومی ثبت نشده است.</p>}</section>
      <section className={styles.card}><h2>بازخورد دربارهٔ DM</h2><p className={styles.muted}>این نظرها مستقل از کمپین‌ها ثبت می‌شوند.</p><Reviews key={userId} target={`dms/${userId}`} reviews={page.reviews} canReview={page.canReview} /></section>
      {!!page.campaignReviews?.length && <section className={styles.card}><h2>نظرهای کمپین‌های این DM</h2><p className={styles.muted}>تجربه‌های ثبت‌شده برای کمپین‌ها؛ جدا از بازخورد مستقیم DM.</p>{page.campaignReviews.map(review => <article className={styles.review} key={review.id}><strong>{review.author || review.reviewerName}</strong><p>{review.comment}</p><small>{review.tableTitle}</small></article>)}</section>}
    </>}
  </div></main>;
}
