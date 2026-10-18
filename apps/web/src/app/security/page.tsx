"use client";

import {
  FormEvent,
  useEffect,
  useState,
} from "react";

import styles from "../auth.module.css";

type Status = {
  enabled: boolean;
  confirmedAt: string | null;
};

export default function SecurityPage() {
  const [
    status,
    setStatus,
  ] =
    useState<Status | null>(
      null,
    );

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    code,
    setCode,
  ] =
    useState("");

  const [
    secret,
    setSecret,
  ] =
    useState("");

  const [
    uri,
    setUri,
  ] =
    useState("");

  const [
    message,
    setMessage,
  ] =
    useState<string | null>(
      null,
    );

  async function load() {
    const response =
      await fetch(
        "/api/security/mfa/status",
        {
          cache:
            "no-store",
        },
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data?.error?.message ??
        "Security status failed",
      );
    }

    setStatus(
      data as Status,
    );
  }

  useEffect(
    () => {
      void load()
        .catch(
          (reason) =>
            setMessage(
              reason instanceof Error
                ? reason.message
                : "Load failed",
            ),
        );
    },
    [],
  );

  async function setup(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const response =
      await fetch(
        "/api/security/mfa/setup",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              password,
            }),
        },
      );

    const data =
      await response.json();

    if (!response.ok) {
      setMessage(
        data?.error?.message ??
        "MFA setup failed",
      );

      return;
    }

    setSecret(
      data.secret,
    );

    setUri(
      data.otpauthUri,
    );

    setMessage(
      "Secret را داخل Authenticator اضافه کن و بعد کد شش‌رقمی را Confirm کن.",
    );
  }

  async function confirm() {
    const response =
      await fetch(
        "/api/security/mfa/confirm",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              code,
            }),
        },
      );

    const data =
      await response.json();

    if (!response.ok) {
      setMessage(
        data?.error?.message ??
        "MFA confirmation failed",
      );

      return;
    }

    setSecret("");
    setUri("");
    setMessage(
      "TOTP MFA فعال شد.",
    );

    await load();
  }

  async function disable() {
    const response =
      await fetch(
        "/api/security/mfa/disable",
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              password,
              code,
            }),
        },
      );

    const data =
      await response.json();

    if (!response.ok) {
      setMessage(
        data?.error?.message ??
        "MFA disable failed",
      );

      return;
    }

    setCode("");
    setMessage(
      "TOTP MFA غیرفعال شد.",
    );

    await load();
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.eyebrow}>
          ACCOUNT SECURITY
        </div>

        <h1>
          MFA / TOTP
        </h1>

        <p>
          Status:
          {" "}
          <strong>
            {status?.enabled
              ? "ENABLED"
              : "DISABLED"}
          </strong>
        </p>

        <form
          className={styles.form}
          onSubmit={setup}
        >
          <label className={styles.field}>
            <span>
              Current Password
            </span>

            <input
              type="password"
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

          {!status?.enabled && (
            <button
              className={styles.button}
              type="submit"
            >
              Start MFA Setup
            </button>
          )}
        </form>

        {secret && (
          <>
            <p>
              Authenticator Secret:
            </p>

            <div className={styles.error}>
              {secret}
            </div>

            <p>
              OTPAuth URI:
            </p>

            <div
              className={styles.error}
              style={{
                overflowWrap:
                  "anywhere",
              }}
            >
              {uri}
            </div>
          </>
        )}

        {(secret ||
          status?.enabled) && (
          <div className={styles.form}>
            <label className={styles.field}>
              <span>
                Six-digit code
              </span>

              <input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={
                  (event) =>
                    setCode(
                      event.target.value.replace(
                        /\D/g,
                        "",
                      ),
                    )
                }
              />
            </label>

            {secret && (
              <button
                className={styles.button}
                type="button"
                onClick={
                  () =>
                    void confirm()
                }
              >
                Confirm MFA
              </button>
            )}

            {status?.enabled && (
              <button
                className={styles.button}
                type="button"
                onClick={
                  () =>
                    void disable()
                }
              >
                Disable MFA
              </button>
            )}
          </div>
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