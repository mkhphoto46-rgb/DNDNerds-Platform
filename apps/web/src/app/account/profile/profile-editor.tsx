"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { prepareProfileImage, profileRequest } from "@/lib/profile-pages";
import styles from "@/components/profile-pages.module.css";
type Profile = { userId: string; displayName: string; bio: string; avatarData: string | null; bannerData: string | null };
export default function PlayerProfileEditor() {
  const [form, setForm] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  useEffect(() => { void profileRequest<Profile>("players/me/page").then(setForm).catch(e => setError(e.message)); }, []);
  async function image(file: File | undefined, kind: "avatar" | "banner") {
    if (!file) return; setBusy(true); setError("");
    try { const value = await prepareProfileImage(file, kind); setForm(current => current && ({ ...current, [kind === "avatar" ? "avatarData" : "bannerData"]: value })); }
    catch (e) { setError(e instanceof Error ? e.message : "تصویر آماده نشد."); } finally { setBusy(false); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try { setForm(await profileRequest<Profile>("players/me/page", "PUT", form)); setMessage("پروفایل ذخیره شد."); }
    catch (e) { setError(e instanceof Error ? e.message : "ذخیره نشد."); } finally { setBusy(false); }
  }
  return <main className={styles.page}><div className={styles.shell}><header className={styles.hero}><h1>پروفایل من</h1><p>معرفی و تصاویر این صفحه عمومی هستند. نمایش هر کاراکتر را جداگانه انتخاب کن.</p></header>
    <nav className={styles.tabs}><Link href="/account">حساب من</Link><Link href="/account/characters">کاراکترهای من</Link><Link href="/account/dm">صفحهٔ DM من</Link></nav>
    {error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status" className={styles.notice}>{message}</p>}
    {!form && !error && <p role="status">در حال بارگذاری…</p>}
    {form && <section className={styles.card}><form className={styles.form} onSubmit={e => void save(e)}>
      <label className={styles.field}>نام نمایشی<input required minLength={2} maxLength={100} value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })}/></label>
      <label className={`${styles.field} ${styles.wide}`}>معرفی<textarea maxLength={1200} value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })}/></label>
      <label className={styles.field}>آواتار · حداکثر ۵۰۰ کیلوبایت<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void image(e.target.files?.[0], "avatar")}/>{form.avatarData && <img className={styles.preview} src={form.avatarData} alt="پیش‌نمایش آواتار"/>}</label>
      <label className={styles.field}>هدر · حداکثر ۱ مگابایت<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void image(e.target.files?.[0], "banner")}/>{form.bannerData && <img className={styles.preview} src={form.bannerData} alt="پیش‌نمایش هدر"/>}</label>
      <div className={`${styles.actions} ${styles.wide}`}><button disabled={busy}>ذخیرهٔ پروفایل</button><button type="button" disabled={busy} onClick={() => setForm({ ...form, avatarData: null, bannerData: null })}>حذف تصاویر</button><Link href={`/player/${form.userId}`}>دیدن پروفایل عمومی ←</Link></div>
    </form></section>}
  </div></main>;
}
