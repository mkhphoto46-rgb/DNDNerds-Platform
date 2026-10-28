"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import styles from "../auth.module.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/account/password-reset/request", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
      });
      if (response.status === 503) throw new Error("ارسال ایمیل هنوز برای سایت فعال نشده است. بعد از راه‌اندازی سرویس ایمیل دوباره تلاش کن.");
      if (!response.ok) throw new Error("درخواست انجام نشد. کمی بعد دوباره تلاش کن.");
      setMessage("اگر این ایمیل حساب داشته باشد، پیوند بازیابی برایش فرستاده می‌شود. پوشهٔ Spam را هم بررسی کن.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "ارتباط با سرور برقرار نشد."); }
    finally { setBusy(false); }
  }

  return <main className={styles.page} dir="rtl"><section className={styles.card}>
    <span className={styles.eyebrow}>ACCOUNT RECOVERY</span>
    <h1>فراموشی رمز عبور</h1>
    <p>ایمیل حساب را وارد کن تا پیوند تغییر رمز برایت فرستاده شود. این پیوند ۳۰ دقیقه اعتبار دارد.</p>
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field}><span>ایمیل</span><input type="email" dir="ltr" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <button className={styles.button} type="submit" disabled={busy}>{busy ? "در حال ارسال…" : "فرستادن پیوند بازیابی"}</button>
    </form>
    <div className={styles.switch}><Link href="/login">بازگشت به ورود</Link></div>
  </section></main>;
}
