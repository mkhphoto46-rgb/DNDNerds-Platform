"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import styles from "../auth.module.css";

export default function VerifyEmailPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (!token) return;
    window.history.replaceState(null, "", window.location.pathname);
    setBusy(true);
    void fetch("/api/account/email-verification/confirm", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
    }).then(async response => {
      if (!response.ok) throw new Error("پیوند تأیید نامعتبر یا منقضی شده است. پیوند تازه‌ای درخواست کن.");
      setVerified(true); setMessage("ایمیل تأیید شد و حساب آمادهٔ ورود است.");
    }).catch(reason => setError(reason instanceof Error ? reason.message : "تأیید ایمیل انجام نشد."))
      .finally(() => setBusy(false));
  }, []);

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/account/email-verification/request", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
      });
      if (response.status === 503) throw new Error("ارسال ایمیل هنوز برای سایت فعال نشده است.");
      if (!response.ok) throw new Error("درخواست انجام نشد. کمی بعد دوباره تلاش کن.");
      setMessage("اگر این ایمیل تأیید نشده باشد، پیوند جدید برایش فرستاده می‌شود. پوشهٔ Spam را هم ببین.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "ارتباط با سرور برقرار نشد."); }
    finally { setBusy(false); }
  }

  return <main className={styles.page} dir="rtl"><section className={styles.card}>
    <span className={styles.eyebrow}>ACCOUNT SECURITY</span><h1>تأیید ایمیل</h1>
    {busy && <p role="status">در حال بررسی…</p>}
    {verified ? <><p role="status">{message}</p><Link href="/login">ورود به حساب</Link></> : <>
      <p>پیوندی را که به ایمیلت فرستاده شده باز کن. اگر به دستت نرسید، ایمیل را وارد کن تا پیوند تازه‌ای بگیری.</p>
      <form className={styles.form} onSubmit={resend}>
        <label className={styles.field}><span>ایمیل</span><input type="email" dir="ltr" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        <button className={styles.button} type="submit" disabled={busy}>{busy ? "در حال بررسی…" : "فرستادن دوبارهٔ پیوند"}</button>
      </form>
      <div className={styles.switch}><Link href="/login">بازگشت به ورود</Link></div>
    </>}
  </section></main>;
}
