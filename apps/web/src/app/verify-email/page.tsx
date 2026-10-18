"use client";

import {
  useState,
} from "react";

import styles from "../auth.module.css";

export default function VerifyEmailPage() {
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

  async function requestToken() {
    const response =
      await fetch(
        "/api/account/email-verification/request",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            "{}",
        },
      );

    const data =
      await response.json();

    if (!response.ok) {
      setMessage(
        data?.error?.message ??
        "Verification request failed",
      );

      return;
    }

    if (data.devToken) {
      setToken(
        data.devToken,
      );
    }

    setMessage(
      data.alreadyVerified
        ? "Email قبلاً تأیید شده."
        : "Verification token ساخته شد. در حالت development داخل Email Outbox هم ثبت شده.",
    );
  }

  async function confirm() {
    const response =
      await fetch(
        "/api/account/email-verification/confirm",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              token,
            }),
        },
      );

    const data =
      await response.json();

    if (!response.ok) {
      setMessage(
        data?.error?.message ??
        "Verification failed",
      );

      return;
    }

    setMessage(
      "Email با موفقیت تأیید شد.",
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.eyebrow}>
          ACCOUNT SECURITY
        </div>

        <h1>
          Email Verification
        </h1>

        <button
          className={styles.button}
          type="button"
          onClick={
            () =>
              void requestToken()
          }
        >
          Send Verification
        </button>

        <div className={styles.form}>
          <label className={styles.field}>
            <span>
              Verification Token
            </span>

            <input
              value={token}
              onChange={
                (event) =>
                  setToken(
                    event.target.value,
                  )
              }
            />
          </label>

          <button
            className={styles.button}
            type="button"
            onClick={
              () =>
                void confirm()
            }
          >
            Confirm Email
          </button>
        </div>

        {message && (
          <p>
            {message}
          </p>
        )}
      </section>
    </main>
  );
}