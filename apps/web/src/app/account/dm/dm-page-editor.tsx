"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { prepareProfileImage, profileRequest } from "@/lib/profile-pages";
import styles from "@/components/profile-pages.module.css";

type DmProfile = { userId: string; displayName: string; bio: string; playStyle: string; languages: string; experienceYears: number; visible: boolean; avatarData: string | null; bannerData: string | null };
const defaults: Omit<DmProfile, "userId"> = { displayName: "", bio: "", playStyle: "داستان‌محور", languages: "فارسی", experienceYears: 0, visible: true, avatarData: null, bannerData: null };

export default function DmPageEditor() {
  const [profile, setProfile] = useState<DmProfile | null>(null);
  const [form, setForm] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { void profileRequest<DmProfile | null>("dms/me/page").then(value => { setProfile(value); if (value) setForm(value); }).catch(reason => setError(reason.message)).finally(() => setLoading(false)); }, []);

  async function activate() {
    setBusy(true); setError("");
    try { const value = await profileRequest<DmProfile>("dms/me/activate", "POST"); setProfile(value); setForm(value); setMessage("صفحهٔ DM ساخته شد. حالا آن را کامل کن."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "ساخت صفحه انجام نشد."); }
    finally { setBusy(false); }
  }
  async function chooseImage(file: File | undefined, kind: "avatar" | "banner") {
    if (!file) return;
    setBusy(true); setError("");
    try { const data = await prepareProfileImage(file, kind); setForm(current => ({ ...current, [kind === "avatar" ? "avatarData" : "bannerData"]: data })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "پردازش تصویر ناموفق بود."); }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try { const value = await profileRequest<DmProfile>("dms/me/page", "PUT", form); setProfile(value); setForm(value); setMessage("صفحهٔ DM ذخیره شد."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "ذخیره انجام نشد."); }
    finally { setBusy(false); }
  }

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.hero}><p>حساب من · DM</p><h1>صفحهٔ DM من</h1><p>معرفی، تصویر و میزهایت را در یک صفحهٔ عمومی به بازیکنان نشان بده.</p></header>
    <nav className={styles.tabs}><Link href="/account">حساب من</Link><Link href="/account/games">میزهای من</Link><Link href="/account/characters">کاراکترهای من</Link></nav>
    {loading && <p role="status">در حال بارگذاری…</p>}
    {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    {message && <p className={styles.notice} role="status">{message}</p>}
    {!loading && !profile && <section className={styles.card}><h2>صفحهٔ DM بساز</h2><p>با ساخت صفحه، بازیکنان می‌توانند معرفی، میزها و نظرهای مربوط به بازی‌هایت را ببینند.</p><button className={styles.button} disabled={busy} onClick={() => void activate()}>تبدیل حساب به صفحهٔ DM</button><p><Link href="/login?next=%2Faccount%2Fdm">اگر وارد نشده‌ای، وارد حساب شو ←</Link></p></section>}
    {profile && <>
      <div className={styles.actions}><Link href={`/dm/${profile.userId}`}>دیدن صفحهٔ عمومی من ←</Link><Link href="/account/create-game">ساخت میز تازه ←</Link></div>
      <section className={styles.card}><form className={styles.form} onSubmit={event => void save(event)}>
        <label className={styles.field}><span>نام نمایشی</span><input required minLength={2} maxLength={100} value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} /></label>
        <label className={styles.field}><span>سال تجربه</span><input type="number" min={0} max={60} value={form.experienceYears} onChange={e => setForm({ ...form, experienceYears: Number(e.target.value) })} /></label>
        <label className={styles.field}><span>سبک اجرا</span><input required minLength={2} maxLength={60} value={form.playStyle} onChange={e => setForm({ ...form, playStyle: e.target.value })} /></label>
        <label className={styles.field}><span>زبان بازی</span><input required minLength={2} maxLength={120} value={form.languages} onChange={e => setForm({ ...form, languages: e.target.value })} /></label>
        <label className={`${styles.field} ${styles.wide}`}><span>معرفی و تجربهٔ بازی‌گردانی</span><textarea maxLength={1200} rows={5} value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} /></label>
        <label className={styles.field}><span>آواتار · تا ۴۰۰×۴۰۰ و ۱۰۰ کیلوبایت</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void chooseImage(e.target.files?.[0], "avatar")} />{form.avatarData && <img className={styles.preview} src={form.avatarData} alt="پیش‌نمایش آواتار" />}</label>
        <label className={styles.field}><span>بنر · تا ۱۲۰۰×۳۰۰ و ۲۳۰ کیلوبایت</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void chooseImage(e.target.files?.[0], "banner")} />{form.bannerData && <img className={styles.preview} src={form.bannerData} alt="پیش‌نمایش بنر" />}</label>
        <label className={styles.check}><input type="checkbox" checked={form.visible} onChange={e => setForm({ ...form, visible: e.target.checked })} /> نمایش عمومی صفحه</label>
        <div className={`${styles.actions} ${styles.wide}`}><button disabled={busy}>ذخیرهٔ صفحه</button>{form.avatarData && <button className={styles.secondary} type="button" onClick={() => setForm({ ...form, avatarData: null })}>حذف آواتار</button>}{form.bannerData && <button className={styles.secondary} type="button" onClick={() => setForm({ ...form, bannerData: null })}>حذف بنر</button>}</div>
      </form></section>
    </>}
  </div></main>;
}
