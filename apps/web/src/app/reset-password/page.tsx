"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import styles from "../auth.module.css";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const fromLink = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (fromLink) { setToken(fromLink); window.history.replaceState(null, "", window.location.pathname); }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    if (password !== confirmation) { setError("رمز جدید و تکرار آن یکسان نیستند."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/account/password-reset/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, newPassword: password }),
      });
      if (!response.ok) throw new Error("پیوند نامعتبر یا منقضی شده است. از صفحهٔ فراموشی رمز، پیوند تازه بگیر.");
      setMessage("رمز عبور تغییر کرد. برای امنیت حساب، همهٔ نشست‌های قبلی بسته شدند. دوباره وارد شو.");
      setPassword(""); setConfirmation(""); setToken("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تغییر رمز انجام نشد."); }
    finally { setBusy(false); }
  }

  return <main className={styles.page} dir="rtl"><section className={styles.card}>
    <span className={styles.eyebrow}>ACCOUNT RECOVERY</span><h1>انتخاب رمز جدید</h1>
    <p>پیوندی را که به ایمیلت رسیده باز کن و رمز تازه‌ای با دست‌کم ۱۲ نویسه انتخاب کن.</p>
    {message ? <><p role="status">{message}</p><Link href="/login">ورود با رمز جدید</Link></> :
      <form className={styles.form} onSubmit={submit}>
        {!token && <label className={styles.field}><span>کد بازیابی</span><input dir="ltr" value={token} onChange={event => setToken(event.target.value)} required /></label>}
        <label className={styles.field}><span>رمز جدید</span><input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} required /></label>
        <label className={styles.field}><span>تکرار رمز جدید</span><input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} required /></label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <button className={styles.button} type="submit" disabled={busy}>{busy ? "در حال تغییر…" : "ثبت رمز جدید"}</button>
      </form>}
    <div className={styles.switch}><Link href="/forgot-password">دریافت پیوند تازه</Link></div>
  </section></main>;
}
