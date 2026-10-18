"use client";

import {
  FormEvent,
  useState,
} from "react";

import styles from "../auth.module.css";

export default function ResetPasswordPage() {
  const [
    token,
    setToken,
  ] =
    useState("");

  const [
    password,
    setPassword,
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
        "/api/account/password-reset/confirm",
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

              newPassword:
                password,
            }),
        },
      );

    const data =
      await response.json();

    if (!response.ok) {
      setMessage(
        data?.error?.message ??
        "Password reset failed",
      );

      return;
    }

    setMessage(
      "Password تغییر کرد و همه Sessionهای قبلی Revoke شدند.",
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.eyebrow}>
          ACCOUNT RECOVERY
        </div>

        <h1>
          Reset Password
        </h1>

        <form
          className={styles.form}
          onSubmit={submit}
        >
          <label className={styles.field}>
            <span>
              Reset Token
            </span>

            <input
              value={token}
              onChange={
                (event) =>
                  setToken(
                    event.target.value,
                  )
              }
              required
            />
          </label>

          <label className={styles.field}>
            <span>
              New Password
            </span>

            <input
              type="password"
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
          </label>

          <button
            className={styles.button}
            type="submit"
          >
            Change Password
          </button>
        </form>

        {message && (
          <p>
            {message}
          </p>
        )}
      </section>
    </main>
  );
}