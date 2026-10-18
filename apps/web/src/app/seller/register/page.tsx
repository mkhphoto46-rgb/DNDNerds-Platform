"use client";

import {
  FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import styles from "../seller-dashboard.module.css";

export default function SellerRegisterPage() {
  const router =
    useRouter();

  const [form,setForm] =
    useState({
      displayName: "",
      storeName: "",
      storeSlug: "",
      description: "",
      category: "",
    });

  const [error,setError] =
    useState<string | null>(null);

  const [loading,setLoading] =
    useState(false);

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
          "/api/seller/onboard",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify(form),
          },
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error?.message ??
          "Seller onboarding failed",
        );
      }

      router.push(
        "/seller/dashboard",
      );
      router.refresh();
    }
    catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Seller onboarding failed",
      );
    }
    finally {
      setLoading(false);
    }
  }

  function set(
    key: keyof typeof form,
    value: string,
  ) {
    setForm({
      ...form,
      [key]: value,
    });
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div className={styles.eyebrow}>
            SELLER ONBOARDING
          </div>
          <h1>
            ساخت فروشگاه
          </h1>
          <p className={styles.meta}>
            Seller و Store ابتدا با وضعیت PENDING_REVIEW ساخته می‌شوند.
          </p>
        </header>

        <section className={styles.card}>
          <form
            className={styles.form}
            onSubmit={submit}
          >
            <label className={styles.field}>
              <span>نام فروشنده</span>
              <input
                required
                value={form.displayName}
                onChange={
                  (event) =>
                    set("displayName",event.target.value)
                }
              />
            </label>

            <label className={styles.field}>
              <span>نام فروشگاه</span>
              <input
                required
                value={form.storeName}
                onChange={
                  (event) =>
                    set("storeName",event.target.value)
                }
              />
            </label>

            <label className={styles.field}>
              <span>Store Slug</span>
              <input
                required
                placeholder="my-ttrpg-store"
                value={form.storeSlug}
                onChange={
                  (event) =>
                    set("storeSlug",event.target.value)
                }
              />
            </label>

            <label className={styles.field}>
              <span>Category</span>
              <input
                required
                value={form.category}
                onChange={
                  (event) =>
                    set("category",event.target.value)
                }
              />
            </label>

            <label className={styles.wide}>
              <span>Description</span>
              <textarea
                required
                value={form.description}
                onChange={
                  (event) =>
                    set("description",event.target.value)
                }
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
                ? "در حال ثبت..."
                : "ارسال برای بررسی"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}