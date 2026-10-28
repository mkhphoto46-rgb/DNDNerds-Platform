"use client";

import Link from "next/link";
import { XpBar } from "@/components/xp-experience";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./account.module.css";

type AccountUser = {
  id: string;
  publicId: string;
  username: string | null;
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
  const [username, setUsername] = useState("");
  const [usernameMessage, setUsernameMessage] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setAccount({ kind: "loading" });
    setOrders([]);
    setOrdersStatus("loading");
    try {
      const response = await fetch("/api/auth/me", {
        method: "GET", credentials: "same-origin", cache: "no-store",
      });
      if (requestId !== latestRequest.current) return;
      if (response.status === 401) {
        setAccount({ kind: "guest" });
        return;
      }
      if (!response.ok) throw new Error("دریافت اطلاعات حساب ناموفق بود.");
      const body: { user?: AccountUser } = await response.json();
      if (requestId !== latestRequest.current) return;
      if (!body.user?.id || !body.user?.email) throw new Error("اطلاعات حساب ناقص است.");
      setAccount({ kind: "ready", user: body.user });
      setUsername(body.user.username ?? "");
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      setAccount({ kind: "error", message: error instanceof Error ? error.message : "خطای ارتباط با سرور" });
      return;
    }
    try {
      const response = await fetch("/api/marketplace/orders", {
        method: "GET", credentials: "same-origin", cache: "no-store",
      });
      if (requestId !== latestRequest.current) return;
      if (!response.ok) throw new Error("سفارش‌ها در دسترس نیستند");
      const body: { data?: BuyerOrder[] } = await response.json();
      if (requestId !== latestRequest.current) return;
      setOrders(Array.isArray(body.data) ? body.data : []);
      setOrdersStatus("ready");
    } catch {
      if (requestId === latestRequest.current) setOrdersStatus("error");
    }
  }, []);

  useEffect(() => {
    const reload = () => { void refresh(); };
    reload();
    const onVisible = () => { if (document.visibilityState === "visible") reload(); };
    window.addEventListener("focus", reload);
    window.addEventListener("pageshow", reload);
    window.addEventListener("dnd-auth-change", reload);
    document.addEventListener("visibilitychange", onVisible);
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("dnd-nerds-auth-state") : undefined;
    if (channel) channel.onmessage = (event: MessageEvent) => { if (event.data === "auth-change") reload(); };
    return () => {
      latestRequest.current++;
      window.removeEventListener("focus", reload);
      window.removeEventListener("pageshow", reload);
      window.removeEventListener("dnd-auth-change", reload);
      document.removeEventListener("visibilitychange", onVisible);
      channel?.close();
    };
  }, [refresh]);

  async function saveUsername(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingUsername(true);
    setUsernameMessage("");
    try {
      const response = await fetch("/api/auth/username", { method: "PUT", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "ثبت نام کاربری انجام نشد");
      setAccount(current => current.kind === "ready" ? { ...current, user: { ...current.user, username: body.user.username } } : current);
      setUsername(body.user.username);
      setUsernameMessage("نام کاربری ذخیره شد");
      window.dispatchEvent(new Event("dnd-auth-change"));
    } catch (error) { setUsernameMessage(error instanceof Error ? error.message : "ثبت نام کاربری انجام نشد"); }
    finally { setSavingUsername(false); }
  }

  async function signOut() {
    setSigningOut(true); setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error("خروج از حساب انجام نشد. دوباره تلاش کن.");
      window.dispatchEvent(new Event("dnd-auth-change"));
      if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel("dnd-nerds-auth-state"); channel.postMessage("auth-change"); channel.close(); }
      window.location.assign("/");
    } catch (error) { setLogoutError(error instanceof Error ? error.message : "خروج از حساب انجام نشد."); setSigningOut(false); }
  }

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
            <Link className={styles.buttonPrimary} href="/login?next=%2Faccount">ورود به حساب</Link> <Link className={styles.textLink} href="/register?next=%2Faccount">ساخت حساب</Link>
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
            <div style={{ gridColumn: "1 / -1" }}><XpBar /></div>
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
                <div><span>شناسه حساب</span><strong className={styles.id}>{account.user.publicId}</strong></div>
              </div>
              <form className={styles.usernameForm} onSubmit={saveUsername}>
                <label htmlFor="account-username">نام کاربری برای گفتگو و بازی</label>
                <div><input id="account-username" dir="ltr" autoComplete="username" minLength={3} maxLength={24} pattern="[A-Za-z][A-Za-z0-9_]*" value={username} onChange={event => setUsername(event.target.value)} placeholder="example_player" required /><button type="submit" disabled={savingUsername || username === account.user.username}>ذخیره</button></div>
                <small>۳ تا ۲۴ نویسه، با حروف انگلیسی، عدد و زیرخط؛ شروع با حرف</small>
                {usernameMessage && <p role="status">{usernameMessage}</p>}
              </form>
            </section>

            <section className={styles.panel} aria-labelledby="profile-links-heading">
              <div className={styles.sectionHeading}><h2 id="profile-links-heading">پروفایل و شخصیت‌ها</h2></div>
              <div className={styles.actions}>
                <Link className={styles.action} href="/account/profile"><span><strong>پروفایل من</strong><small>نام نمایشی، معرفی، آواتار و هدر</small></span><span className={styles.arrow}>←</span></Link>
                <Link className={styles.action} href="/account/characters"><span><strong>کاراکترهای من</strong><small>شخصیت‌ها و انتخاب نمایش عمومی هرکدام</small></span><span className={styles.arrow}>←</span></Link>
                <Link className={styles.action} href="/account/dm"><span><strong>صفحهٔ DM من</strong><small>معرفی بازی‌گردان و کمپین‌ها</small></span><span className={styles.arrow}>←</span></Link>
                <Link className={styles.action} href={`/player/${account.user.id}`}><span><strong>دیدن صفحهٔ عمومی من</strong><small>نمایی که دوستان و بازیکنان می‌بینند</small></span><span className={styles.arrow}>←</span></Link>
              </div>
            </section>
            <section className={styles.panel} aria-labelledby="security-links-heading">
              <div className={styles.sectionHeading}><h2 id="security-links-heading">امنیت و ورود</h2></div>
              <div className={styles.actions}>
                <Link className={styles.action} href="/account/sessions"><span><strong>دستگاه‌ها و نشست‌ها</strong><small>مدیریت دسترسی به حساب</small></span><span className={styles.arrow}>←</span></Link>
                <Link className={styles.action} href="/account/change-password"><span><strong>تغییر رمز عبور</strong><small>انتخاب رمز تازه با رمز فعلی</small></span><span className={styles.arrow}>←</span></Link>
                {account.user.emailVerified === false && <Link className={styles.action} href="/verify-email"><span><strong>تأیید ایمیل</strong><small>دریافت پیوند تأیید حساب</small></span><span className={styles.arrow}>←</span></Link>}
              </div>
              <button type="button" className={styles.inlineButton} disabled={signingOut} onClick={() => void signOut()}>{signingOut ? "در حال خروج…" : "خروج از حساب"}</button>
              {logoutError && <p role="alert">{logoutError}</p>}
            </section>
            <section className={styles.panel} aria-labelledby="purchase-links-heading">
              <div className={styles.sectionHeading}><h2 id="purchase-links-heading">خرید و اشتراک</h2></div>
              <div className={styles.actions}>
                <Link className={styles.action} href="/orders"><span><strong>سفارش‌های من</strong><small>تاریخچه خرید و جزئیات سفارش</small></span><span className={styles.arrow}>←</span></Link>
                <Link className={styles.action} href="/pricing"><span><strong>اشتراک</strong><small>مشاهدهٔ طرح‌ها و امکانات</small></span><span className={styles.arrow}>←</span></Link>
                <Link className={styles.action} href="/seller/dashboard"><span><strong>پنل فروشنده</strong><small>ویژه حساب‌های دارای دسترسی فروشندگی</small></span><span className={styles.arrow}>←</span></Link>
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
