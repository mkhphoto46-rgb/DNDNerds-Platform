"use client";

import Link from "next/link";
import { safeAuthDestination } from "@/lib/auth-destination";

import {
  FormEvent,
  useState,
  useEffect,
} from "react";

import {
  useRouter,
} from "next/navigation";

import styles from "../auth.module.css";

export default function RegisterPage() {
  const router =
    useRouter();

  const [authNext, setAuthNext] = useState("/");
  useEffect(() => { setAuthNext(safeAuthDestination(new URLSearchParams(window.location.search).get("next"))); }, []);

  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [username, setUsername] = useState("");

  const [
    email,
    setEmail,
  ] =
    useState("");

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );
  const [pendingApproval, setPendingApproval] = useState(false);
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [verificationEmailSent, setVerificationEmailSent] = useState(false);

  async function submit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError(null);
    if (password !== confirmPassword) {
      setError("رمز عبور و تکرار رمز یکسان نیستند.");
      return;
    }
    setLoading(true);

    try {
      const response =
        await fetch(
          "/api/auth/register",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                email,
                username,
                password,
              }),
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error?.message ??
          "ساخت حساب انجام نشد",
        );
      }

      if (data.verificationRequired) {
        setVerificationRequired(true);
        setVerificationEmailSent(data.verificationEmailSent === true);
        return;
      }

      if (data.pendingApproval) {
        setPendingApproval(true);
        return;
      }

      const sessionCheck = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
      if (!sessionCheck.ok) {
        throw new Error("حساب ساخته شد، اما ورود خودکار تأیید نشد. با همان حساب از صفحه ورود وارد شو.");
      }
      window.dispatchEvent(new Event("dnd-auth-change"));
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("dnd-nerds-auth-state");
        channel.postMessage("auth-change");
        channel.close();
      }
      const requested = new URLSearchParams(window.location.search).get("next");
      const destination = safeAuthDestination(requested);
      router.replace(destination);
      router.refresh();
    }
    catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "ساخت حساب انجام نشد",
      );
    }
    finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.eyebrow}>
          CREATE DND NERDS ACCOUNT
        </div>

        <h1>
          ساخت حساب
        </h1>

        <p>
          ایمیل، نام کاربری یکتا و رمزی با دست‌کم ۸ نویسه وارد کن
        </p>

        {verificationRequired ? (
          <div role="status"><p>{verificationEmailSent ? "حساب ساخته شد. پیوند تأیید ایمیل را باز کن تا حساب خودکار فعال شود." : "حساب ساخته شد، اما ارسال ایمیل انجام نشد. از صفحهٔ تأیید ایمیل، پیوند تازه‌ای درخواست کن."}</p><Link href="/verify-email">رفتن به تأیید ایمیل</Link></div>
        ) : pendingApproval ? (
          <p role="status">درخواست حساب ثبت شد. پس از تأیید مدیر می‌توانی وارد شوی.</p>
        ) : <form
          className={styles.form}
          onSubmit={submit}
        >
          <label className={styles.field}>
            <span>
              Email
            </span>

            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={
                (event) =>
                  setEmail(
                    event.target.value,
                  )
              }
              required
            />
          </label>

          <label className={styles.field}>
            <span>نام کاربری برای گفتگو و بازی</span>
            <input type="text" autoComplete="username" dir="ltr" minLength={3} maxLength={24} pattern="[A-Za-z][A-Za-z0-9_]*" value={username} onChange={event => setUsername(event.target.value)} placeholder="example_player" required />
          </label>

          <div className={styles.field}>
            <label htmlFor="register-password">Password</label>

            <input
              id="register-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={
                (event) =>
                  setPassword(
                    event.target.value,
                  )
              }
              required
            />
            <button className={styles.passwordToggle} type="button" aria-pressed={showPassword} onClick={() => setShowPassword((shown) => !shown)}>
              {showPassword ? "پنهان‌کردن رمز" : "نمایش رمز"}
            </button>
          </div>

          <label className={styles.field}>
            <span>تکرار Password</span>
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>

          {error && (
            <div className={styles.error}>
              {error}
            </div>
          )}

          <button
            className={styles.button}
            type="submit"
            disabled={loading}
          >
            {loading
              ? "در حال ساخت حساب..."
              : "ساخت حساب"}
          </button>
        </form>}

        <div className={styles.switch}>
          حساب داری؟
          {" "}
          <Link href={`/login?next=${encodeURIComponent(authNext)}`}>
            ورود
          </Link>
        </div>
      </section>
    </main>
  );
}
