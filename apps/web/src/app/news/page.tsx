import type { Metadata } from "next";
import { apiFetch } from "@/lib/bff-api";
import Link from "next/link";
import styles from "@/components/game-hub.module.css";
export const metadata: Metadata = { title: "اخبار" };
export const dynamic = "force-dynamic";
type Post = { id: string; title: string; summary: string; body: string; createdAt: string };
export default async function Page() {
  let posts: Post[] = [];
  try { const response = await apiFetch("/api/v1/game-hub/posts"); if (response.ok) posts = (await response.json()).data; } catch { /* Show a readable empty state. */ }
  return <main className={styles.page}><div className="shell"><header className={styles.intro}><span className="section-kicker">اخبار پلتفرم</span><h1>تازه‌های DND Nerds</h1><p>خبرها و تغییراتی که تیم سایت منتشر کرده است.</p></header><div className={styles.grid}>{posts.map(post => <article className={styles.card} key={post.id}><small>{new Date(post.createdAt).toLocaleDateString("fa-IR")}</small><h2>{post.title}</h2><p>{post.summary}</p><details><summary>خواندن خبر</summary><p style={{ whiteSpace: "pre-wrap" }}>{post.body}</p></details></article>)}</div>{!posts.length && <div className={styles.empty}>هنوز خبری منتشر نشده است. برای پیدا کردن میزها به <Link href="/find-game">بخش بازی‌ها</Link> برو.</div>}</div></main>;
}
