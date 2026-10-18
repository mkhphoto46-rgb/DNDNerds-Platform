"use client";

import {
  FormEvent,
  useState,
} from "react";

import styles from "../auth.module.css";

export default function ForgotPasswordPage() {
  const [
    email,
    setEmail,
  ] =
    useState("");

  const [
    token,
    setToken,
  ] =
    useState("");

  const [
    message,
    setMessage,
  ] =
    useState<string | null>(
      null,
    );

  async function submit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const response =
      await fetch(
        "/api/account/password-reset/request",
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
            }),
        },
      );

    const data =
      await response.json();

    if (data.devToken) {
      setToken(
        data.devToken,
      );
    }

    setMessage(
      "اگر این Email حساب فعال داشته باشد، درخواست Reset ساخته شد.",
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.eyebrow}>
          ACCOUNT RECOVERY
        </div>

        <h1>
          فراموشی رمز عبور
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

          <button
            className={styles.button}
            type="submit"
          >
            Request Reset
          </button>
        </form>

        {token && (
          <>
            <p>
              Development Token:
            </p>

            <div className={styles.error}>
              {token}
            </div>
          </>
        )}

        {message && (
          <p>
            {message}
          </p>
        )}
      </section>
    </main>
  );
}