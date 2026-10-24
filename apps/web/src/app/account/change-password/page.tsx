"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import styles from "../../auth.module.css";

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (newPassword !== confirmation) { setError("رمز جدید و تکرار آن یکسان نیستند."); return; }
    if (currentPassword === newPassword) { setError("رمز جدید باید با رمز فعلی فرق داشته باشد."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/account/password/change", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (response.status === 401) throw new Error("رمز فعلی اشتباه است یا نشستت تمام شده است.");
      if (!response.ok) throw new Error("تغییر رمز انجام نشد. دوباره تلاش کن.");
      setDone(true); setCurrentPassword(""); setNewPassword(""); setConfirmation("");
      window.dispatchEvent(new Event("dnd-auth-change"));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "ارتباط با سرور برقرار نشد."); }
    finally { setBusy(false); }
  }

  return <main className={styles.page} dir="rtl"><section className={styles.card}>
    <span className={styles.eyebrow}>ACCOUNT SECURITY</span><h1>تغییر رمز عبور</h1>
    {done ? <><p role="status">رمز تغییر کرد و نشست‌های قبلی بسته شدند. اکنون با رمز جدید وارد شو.</p><Link href="/login">ورود دوباره</Link></> : <>
      <p>رمز فعلی و رمز جدید را وارد کن. رمز جدید باید دست‌کم ۱۲ نویسه باشد.</p>
      <form className={styles.form} onSubmit={submit}>
        <label className={styles.field}><span>رمز فعلی</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} required /></label>
        <label className={styles.field}><span>رمز جدید</span><input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={newPassword} onChange={event => setNewPassword(event.target.value)} required /></label>
        <label className={styles.field}><span>تکرار رمز جدید</span><input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button className={styles.button} type="submit" disabled={busy}>{busy ? "در حال تغییر…" : "تغییر رمز"}</button>
      </form>
      <div className={styles.switch}><Link href="/account">بازگشت به حساب</Link></div>
    </>}
  </section></main>;
}
