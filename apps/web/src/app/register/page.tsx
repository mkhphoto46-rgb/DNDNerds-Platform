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

export default function RegisterPage() {
  const router =
    useRouter();

  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");

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
      const destination = requested === "/checkout" ? "/checkout" : "/";
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
          رمز عبور حداقل ۱۲ کاراکتر باشد. رمز به‌صورت Argon2id hash در دیتابیس ذخیره می‌شود.
        </p>

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
            <label htmlFor="register-password">Password</label>

            <input
              id="register-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={12}
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
              minLength={12}
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
        </form>

        <div className={styles.switch}>
          حساب داری؟
          {" "}
          <Link href="/login">
            ورود
          </Link>
        </div>
      </section>
    </main>
  );
}