"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "./account.module.css";

type AccountUser = {
  id: string;
  email: string;
  emailVerified?: boolean;
};

type BuyerOrder = {
  id: string;
  status: string;
  customerTotalToman: number;
  createdAt: string;
};

type AccountState =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "error"; message: string }
  | { kind: "ready"; user: AccountUser };

function money(value: number) {
  return `${new Intl.NumberFormat("fa-IR").format(value)} تومان`;
}

function timestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "زمان نامشخص"
    : date.toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });
}

const orderLabels: Record<string, string> = {
  PENDING_PAYMENT: "در انتظار پرداخت",
  CREATED: "ثبت‌شده",
  PAID: "پرداخت‌شده",
  PROCESSING: "در حال پردازش",
  SHIPPED: "ارسال‌شده",
  DELIVERED: "تحویل‌شده",
  CANCELLED: "لغوشده",
  CANCELED: "لغوشده",
  REFUNDED: "بازپرداخت‌شده",
  PAYMENT_FAILED: "پرداخت ناموفق",
  EXPIRED: "منقضی‌شده",
};

export default function AccountHomePage() {
  const [account, setAccount] = useState<AccountState>({ kind: "loading" });
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [ordersStatus, setOrdersStatus] = useState<"loading" | "ready" | "error">("loading");

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setAccount({ kind: "loading" });
    setOrders([]);
    setOrdersStatus("loading");
    try {
      const response = await fetch("/api/auth/me", {
        method: "GET", credentials: "same-origin", cache: "no-store", signal,
      });
      if (signal?.aborted) return;
      if (response.status === 401) {
        setAccount({ kind: "guest" });
        return;
      }
      if (!response.ok) throw new Error("دریافت اطلاعات حساب ناموفق بود.");
      const body: { user?: AccountUser } = await response.json();
      if (signal?.aborted) return;
      if (!body.user?.id || !body.user?.email) throw new Error("اطلاعات حساب ناقص است.");
      setAccount({ kind: "ready", user: body.user });
    } catch (error) {
      if (signal?.aborted) return;
      setAccount({ kind: "error", message: error instanceof Error ? error.message : "خطای ارتباط با سرور" });
      return;
    }
    try {
      const response = await fetch("/api/marketplace/orders", {
        method: "GET", credentials: "same-origin", cache: "no-store", signal,
      });
      if (signal?.aborted) return;
      if (!response.ok) throw new Error("سفارش‌ها در دسترس نیستند");
      const body: { data?: BuyerOrder[] } = await response.json();
      if (signal?.aborted) return;
      setOrders(Array.isArray(body.data) ? body.data : []);
      setOrdersStatus("ready");
    } catch {
      if (!signal?.aborted) setOrdersStatus("error");
    }
  }, []);

  useEffect(() => {
    let controller = new AbortController();
    const reload = () => {
      controller.abort();
      controller = new AbortController();
      void refresh(controller.signal);
    };
    reload();
    const onVisible = () => { if (document.visibilityState === "visible") reload(); };
    window.addEventListener("focus", reload);
    window.addEventListener("pageshow", reload);
    window.addEventListener("dnd-auth-change", reload);
    document.addEventListener("visibilitychange", onVisible);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("dnd-nerds-auth-state") : undefined;
    if (channel) channel.onmessage = (event: MessageEvent) => { if (event.data === "auth-change") reload(); };
    return () => {
      controller.abort();
      window.removeEventListener("focus", reload);
      window.removeEventListener("pageshow", reload);
      window.removeEventListener("dnd-auth-change", reload);
      document.removeEventListener("visibilitychange", onVisible);
      channel?.close();
    };
  }, [refresh]);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.eyebrow}>D&D NERDS · MY ACCOUNT</div>
          <h1>حساب کاربری من</h1>
          <p>پروفایل، سفارش‌ها و دسترسی به بخش‌های حساب در یک مکان.</p>
        </header>

        {account.kind === "loading" && <section className={styles.notice} role="status">در حال بررسی نشست و بارگذاری حساب…</section>}
        {account.kind === "guest" && (
          <section className={styles.notice}>
            <h2>برای مشاهده حساب وارد شو</h2>
            <p>نشست فعالی پیدا نشد. اطلاعات شخصی فقط بعد از ورود نمایش داده می‌شوند.</p>
            <Link className={styles.buttonPrimary} href="/login?next=%2Faccount">ورود به حساب</Link>
          </section>
        )}
        {account.kind === "error" && (
          <section className={styles.notice} role="alert">
            <h2>بارگذاری حساب انجام نشد</h2>
            <p>{account.message}</p>
            <button className={styles.buttonPrimary} onClick={() => void refresh()} type="button">تلاش مجدد</button>
          </section>
        )}
        {account.kind === "ready" && (
          <div className={styles.content}>
            <section className={styles.profileCard} aria-label="مشخصات حساب">
              <div className={styles.profileTop}>
                <span className={styles.avatar} aria-hidden="true">{account.user.email.slice(0,1).toUpperCase()}</span>
                <div className={styles.profileIdentity}>
                  <span className={styles.miniLabel}>حساب فعال</span>
                  <h2>{account.user.email}</h2>
                  <p>{account.user.emailVerified === true ? "ایمیل تأیید شده" : account.user.emailVerified === false ? "تأیید ایمیل هنوز انجام نشده" : "اطلاعات حساب"}</p>
                </div>
              </div>
              <div className={styles.detailsGrid}>
                <div><span>ایمیل</span><strong dir="ltr">{account.user.email}</strong></div>
                <div><span>شناسه حساب</span><strong className={styles.id}>{account.user.id}</strong></div>
              </div>
              <p className={styles.hint}>ویرایش نام، شماره تلفن و آدرس در نسخه بعدی حساب کاربری اضافه می‌شود.</p>
            </section>

            <section className={styles.panel} aria-labelledby="account-links-heading">
              <div className={styles.sectionHeading}><div><span className={styles.miniLabel}>ACCOUNT CENTER</span><h2 id="account-links-heading">بخش‌های حساب</h2></div></div>
              <div className={styles.actions}>
                <Link className={styles.action} href="/orders"><span className={styles.actionIcon}>◈</span><span><strong>سفارش‌های من</strong><small>تاریخچه خرید و جزئیات سفارش</small></span><span className={styles.arrow}>←</span></Link>
                <Link className={styles.action} href="/account/sessions"><span className={styles.actionIcon}>◇</span><span><strong>امنیت حساب</strong><small>مدیریت دستگاه‌ها و نشست‌های فعال</small></span><span className={styles.arrow}>←</span></Link>
                <Link className={styles.action} href="/seller/dashboard"><span className={styles.actionIcon}>♜</span><span><strong>پنل فروشنده</strong><small>ویژه حساب‌های دارای دسترسی فروشندگی</small></span><span className={styles.arrow}>←</span></Link>
                <div className={styles.action}><span className={styles.actionIcon}>✦</span><span><strong>درخواست فروشندگی</strong><small>پس از اجرای مراحل احراز اطلاعات، تماس تلفنی و تأیید مدیر فعال می‌شود.</small></span><span className={styles.arrow}>به‌زودی</span></div>
              </div>
            </section>

            <section className={styles.panel} aria-labelledby="recent-heading">
              <div className={styles.sectionHeading}>
                <div><span className={styles.miniLabel}>ORDER HISTORY</span><h2 id="recent-heading">آخرین سفارش‌ها</h2></div>
                <Link className={styles.textLink} href="/orders">نمایش همه ←</Link>
              </div>
              {ordersStatus === "loading" && <p className={styles.empty}>در حال دریافت سفارش‌ها…</p>}
              {ordersStatus === "error" && <p className={styles.empty}>دریافت سفارش‌ها ناموفق بود. <button type="button" className={styles.inlineButton} onClick={() => void refresh()}>تلاش مجدد</button></p>}
              {ordersStatus === "ready" && orders.length === 0 && <p className={styles.empty}>هنوز سفارشی برای این حساب ثبت نشده است.</p>}
              {ordersStatus === "ready" && orders.slice(0, 4).map((order) => (
                <Link className={styles.orderRow} key={order.id} href={`/orders/${encodeURIComponent(order.id)}`}>
                  <span className={styles.orderInfo}><strong>سفارش #{order.id.slice(0, 8)}</strong><small>{timestamp(order.createdAt)}</small></span>
                  <span className={styles.orderMeta}><strong>{money(order.customerTotalToman)}</strong><small>{orderLabels[order.status] ?? order.status}</small></span>
                </Link>
              ))}
              <p className={styles.hint}>وضعیت‌ها براساس اطلاعات فعلی سفارش نمایش داده می‌شوند؛ تاریخچه جزئیات زمانی رویدادهای سفارش در نسخه تکمیلی حساب اضافه می‌شود.</p>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
