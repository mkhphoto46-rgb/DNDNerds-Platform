"use client";

import Link from "next/link";

import {
  FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import styles from "../auth.module.css";

export default function LoginPage() {
  const router =
    useRouter();

  const [showPassword, setShowPassword] = useState(false);

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
    totpCode,
    setTotpCode,
  ] =
    useState("");

  const [
    mfaRequired,
    setMfaRequired,
  ] =
    useState(false);

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

  async function submit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setLoading(true);
    setError(null);

    try {
      const response =
        await fetch(
          "/api/auth/login",
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
                password,

                ...(mfaRequired
                  ? {
                      totpCode,
                    }
                  : {}),
              }),
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        if (
          data?.error?.code ===
          "MFA_REQUIRED"
        ) {
          setMfaRequired(
            true,
          );

          setError(
            "کد شش‌رقمی Authenticator را وارد کن.",
          );

          return;
        }

        throw new Error(
          data?.error?.message ??
          "ورود انجام نشد",
        );
      }

      // Confirm that the browser retained the HttpOnly session cookie.
      // This checks authentication without exposing or logging credentials.
      const sessionCheck = await fetch("/api/auth/me", { cache: "no-store" });
      if (!sessionCheck.ok) {
        throw new Error(
          "ورود تأیید شد، اما نشست در مرورگر ذخیره یا ارسال نشد. از localhost:3100 استفاده کن و تنظیمات Cookie را بررسی کن.",
        );
      }

      const requested = new URLSearchParams(window.location.search).get("next");
      const destination = requested === "/seller/dashboard" || requested === "/seller/payouts"
        ? requested : "/";
      window.dispatchEvent(new Event("dnd-auth-change"));
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("dnd-nerds-auth-state");
        channel.postMessage("auth-change");
        channel.close();
      }
      router.replace(destination);
      router.refresh();
    }
    catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "ورود انجام نشد",
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
          DND NERDS ACCOUNT
        </div>

        <h1>
          ورود
        </h1>

        <form
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

          <div className={styles.field}>
            <label htmlFor="login-password">Password</label>

            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              minLength={12}
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

          {mfaRequired && (
            <label className={styles.field}>
              <span>
                Authenticator Code
              </span>

              <input
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                autoComplete="one-time-code"
                value={totpCode}
                onChange={
                  (event) =>
                    setTotpCode(
                      event.target.value.replace(
                        /\D/g,
                        "",
                      ),
                    )
                }
                required
              />
            </label>
          )}

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
              ? "در حال ورود..."
              : mfaRequired
                ? "تأیید MFA و ورود"
                : "ورود"}
          </button>
        </form>

        <div className={styles.switch}>
          حساب نداری؟
          {" "}
          <Link href="/register">
            ساخت حساب
          </Link>
        </div>
      </section>
    </main>
  );
}