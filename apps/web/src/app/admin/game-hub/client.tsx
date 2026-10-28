"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "@/components/game-hub.module.css";



type Row = { id?: string; userId?: string; tableId?: string; title?: string; displayName?: string; status?: string; visible?: boolean; mode?: string; bio?: string };
type Overview = { profiles: Row[]; tables: Row[]; applications: Row[]; arena: Row[]; counts: { profiles: number; tables: number; pending: number; arena: number } };
type Post = { id: string; title: string; summary: string; body: string; status: "DRAFT" | "PUBLISHED" };

export default function GameHubAdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postForm, setPostForm] = useState({ title: "", summary: "", body: "", status: "DRAFT" as "DRAFT" | "PUBLISHED" });
  const [editPostId, setEditPostId] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const response = await fetch("/api/game-hub/admin/overview", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.message ?? "دسترسی مدیر لازم است.");
    setData(body.data);
    const postsResponse = await fetch("/api/game-hub/admin/posts", { cache: "no-store" });
    if (postsResponse.ok) setPosts((await postsResponse.json()).data);
  }, []);
  useEffect(() => { void reload().catch(reason => setError(reason.message)); }, [reload]);
  async function moderate(kind: string, targetId: string, action: "HIDE" | "RESTORE") {
    if (!password) { setError("رمز مدیر را وارد کنید."); return; }
    const reason = window.prompt("دلیل این تصمیم را ثبت کنید:", "");
    if (reason === null) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/game-hub/admin/${kind}/${targetId}/moderate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, password, reason }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "ثبت تصمیم ناموفق بود.");
      setNotice("تصمیم ثبت شد."); await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "خطا رخ داد."); }
    finally { setBusy(false); }
  }
  async function savePost(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(editPostId ? `/api/game-hub/admin/posts/${editPostId}` : "/api/game-hub/admin/posts", { method: editPostId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...postForm, password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "خبر ذخیره نشد.");
      setNotice("خبر ذخیره شد."); setEditPostId(null); setPostForm({ title: "", summary: "", body: "", status: "DRAFT" }); await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "خطا رخ داد."); }
    finally { setBusy(false); }
  }
  async function togglePost(post: Post) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/game-hub/admin/posts/${post.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: post.title, summary: post.summary, body: post.body, status: post.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED", password }) });
      const body = await response.json(); if (!response.ok) throw new Error(body?.error?.message ?? "خبر ویرایش نشد.");
      await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "خطا رخ داد."); }
    finally { setBusy(false); }
  }
  return <main className={styles.page}><div className="shell">
    <header className={styles.intro}><span className="section-kicker">DND NERDS ADMIN</span><h1>داشبورد جامعه و میزها</h1><p>مدیریت پروفایل DM، میزهای منتشرشده و دعوت‌های آرنا</p><Link href="/admin">بازگشت به داشبورد مدیریت ←</Link></header>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    {!data && !error && <p>در حال بارگذاری…</p>}
    {data && <>
      <div className={styles.grid}><div className={styles.card}><h2>{data.counts.profiles}</h2><p>پروفایل DM</p></div><div className={styles.card}><h2>{data.counts.tables}</h2><p>میز بازی</p></div><div className={styles.card}><h2>{data.counts.pending}</h2><p>درخواست عضویت در انتظار</p></div><div className={styles.card}><h2>{data.counts.arena}</h2><p>دعوت باز آرنا</p></div></div>
      <section className={styles.panel}><label>رمز مدیر برای اعمال تصمیم<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></label></section>
      {([ ["dms", "پروفایل DM", data.profiles], ["tables", "میزها", data.tables], ["arena", "دعوت‌های آرنا", data.arena] ] as const).map(([kind, title, rows]) => <section key={kind}><h2>{title}</h2><div className={styles.grid}>{rows.map(row => { const key = kind === "dms" ? row.userId : row.id; const hidden = kind === "dms" ? !row.visible : row.status === "HIDDEN"; return <article className={styles.card} key={key}><h3>{row.displayName || row.title}</h3><p>{row.bio || row.mode || row.status}</p><small>{hidden ? "پنهان" : "قابل نمایش"}</small><div><button disabled={busy || !key} onClick={() => key && void moderate(kind, key, hidden ? "RESTORE" : "HIDE")}>{hidden ? "بازگردانی" : "پنهان کردن"}</button></div></article>; })}</div></section>)}
      <section><h2>درخواست‌های اخیر عضویت</h2><div className={styles.grid}>{data.applications.map(row => <article className={styles.card} key={row.id}><small>{row.status}</small><p>میز: {row.tableId}</p><p>بازیکن: {row.userId}</p></article>)}</div></section>
      <section className={styles.panel}><h2>{editPostId ? "ویرایش خبر" : "انتشار خبر"}</h2><form onSubmit={savePost}><label>عنوان<input required minLength={5} value={postForm.title} onChange={e => setPostForm({ ...postForm, title: e.target.value })} /></label><label>خلاصه<input required minLength={10} value={postForm.summary} onChange={e => setPostForm({ ...postForm, summary: e.target.value })} /></label><label>متن<textarea required minLength={30} value={postForm.body} onChange={e => setPostForm({ ...postForm, body: e.target.value })} /></label><label>وضعیت<select value={postForm.status} onChange={e => setPostForm({ ...postForm, status: e.target.value as "DRAFT" | "PUBLISHED" })}><option value="DRAFT">پیش‌نویس</option><option value="PUBLISHED">انتشار</option></select></label><button disabled={busy}>ذخیره خبر</button>{editPostId && <button type="button" onClick={() => { setEditPostId(null); setPostForm({ title: "", summary: "", body: "", status: "DRAFT" }); }}>لغو ویرایش</button>}</form></section>
      <section><h2>خبرهای ثبت‌شده</h2><div className={styles.grid}>{posts.map(post => <article className={styles.card} key={post.id}><small>{post.status}</small><h3>{post.title}</h3><p>{post.summary}</p><div className={styles.actions}><button disabled={busy} onClick={() => { setEditPostId(post.id); setPostForm({ title: post.title, summary: post.summary, body: post.body, status: post.status }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>ویرایش</button><button disabled={busy} onClick={() => void togglePost(post)}>{post.status === "PUBLISHED" ? "برداشتن از انتشار" : "انتشار"}</button></div></article>)}</div></section>
    </>}
  </div></main>;
}
