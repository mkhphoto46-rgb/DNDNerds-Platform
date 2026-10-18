"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./sessions.module.css";

type Session = {
  id: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  deviceLabel: string;
  userAgent: string | null;
  ipAddress: string | null;
  lastSeenAt: string | null;
  current: boolean;
};

type LoadState = "loading" | "ready" | "unauthorized" | "error";

type SessionStatus = "current" | "active" | "expired" | "revoked";

function statusFor(session: Session): SessionStatus {
  if (session.revokedAt) return "revoked";
  if (new Date(session.expiresAt).getTime() <= Date.now()) return "expired";
  return session.current ? "current" : "active";
}

function dateLabel(value: string | null | undefined): string {
  if (!value) return "ثبت نشده";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "نامشخص";
  return date.toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });
}

function deviceLabel(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (/windows/i.test(v)) return "دستگاه ویندوزی";
  if (/android/i.test(v)) return "دستگاه اندرویدی";
  if (/apple|iphone|ipad|ios/i.test(v)) return "دستگاه اپل";
  if (/mac/i.test(v)) return "رایانه مک";
  if (/linux/i.test(v)) return "دستگاه لینوکسی";
  return "نشست مرورگر (دستگاه نامشخص)";
}

function responseError(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string" && error.message.trim()) return error.message;
  }
  return fallback;
}

export default function AccountSessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoadState("loading");
    setError(null);
    try {
      const response = await fetch("/api/account/sessions", {
        method: "GET", credentials: "same-origin", cache: "no-store", signal,
      });
      if (signal?.aborted) return;
      const body: unknown = await response.json().catch(() => null);
      if (signal?.aborted) return;
      if (response.status === 401) {
        setSessions([]);
        setLoadState("unauthorized");
        return;
      }
      if (!response.ok) throw new Error(responseError(body, "دریافت نشست‌های حساب ناموفق بود."));
      const received = (body as { sessions?: unknown } | null)?.sessions;
      if (!Array.isArray(received)) throw new Error("پاسخ نشست‌ها معتبر نیست.");
      setSessions(received as Session[]);
      setLoadState("ready");
    } catch (cause) {
      if (signal?.aborted) return;
      setLoadState("error");
      setError(cause instanceof Error ? cause.message : "خطای ارتباط با سرور");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const { active, history } = useMemo(() => {
    const activeSessions: Session[] = [];
    const historicalSessions: Session[] = [];
    for (const session of sessions) {
      if (statusFor(session) === "active" || statusFor(session) === "current") {
        activeSessions.push(session);
      } else {
        historicalSessions.push(session);
      }
    }
    activeSessions.sort((a, b) => Number(b.current) - Number(a.current) ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    historicalSessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { active: activeSessions, history: historicalSessions };
  }, [sessions]);

  async function revoke(action: "others" | "single", session?: Session) {
    if (pending) return;
    if (action === "single" && (!session || session.current || statusFor(session) !== "active")) return;
    if (action === "others" && !active.some((item) => !item.current)) return;
    const confirmation = action === "others"
      ? "تمام نشست‌های فعال دیگر از حساب خارج شوند؟ نشست فعلی شما باقی می‌ماند."
      : `دسترسی «${deviceLabel(session?.deviceLabel)}» قطع شود؟ این دستگاه برای ورود مجدد به رمز عبور نیاز خواهد داشت.`;
    if (!window.confirm(confirmation)) return;
    const operation = action === "others" ? "others" : session!.id;
    const endpoint = action === "others"
      ? "/api/account/sessions/revoke-others"
      : `/api/account/sessions/${encodeURIComponent(session!.id)}/revoke`;
    setPending(operation);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 401) {
        setSessions([]);
        setLoadState("unauthorized");
        return;
      }
      if (!response.ok) throw new Error(responseError(body, "لغو نشست انجام نشد."));
      setNotice(action === "others" ? "نشست‌های دیگر لغو شدند." : "دسترسی این نشست لغو شد.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "خطای ارتباط با سرور");
    } finally {
      setPending(null);
    }
  }

  function renderSession(session: Session) {
    const status = statusFor(session);
    return (
      <article className={styles.session} key={session.id}>
        <div className={styles.sessionMain}>
          <span className={styles.deviceIcon} aria-hidden="true">{session.current ? "◉" : "▣"}</span>
          <div className={styles.sessionContent}>
            <div className={styles.sessionTitleRow}>
              <strong className={styles.deviceTitle}>{deviceLabel(session.deviceLabel)}</strong>
              <span className={`${styles.status} ${status === "current" ? styles.current : status === "active" ? styles.active : styles.inactive}`}>
                {status === "current" ? "نشست فعلی" : status === "active" ? "فعال" : status === "expired" ? "منقضی" : "لغوشده"}
              </span>
            </div>
            <div className={styles.sessionDetails}>
              <span>ورود: {dateLabel(session.createdAt)}</span>
              <span>انقضا: {dateLabel(session.expiresAt)}</span>
              {session.revokedAt && <span>زمان لغو: {dateLabel(session.revokedAt)}</span>}
              {session.lastSeenAt && <span>آخرین ثبت اطلاعات دستگاه: {dateLabel(session.lastSeenAt)}</span>}
              {session.ipAddress && <span>IP ثبت‌شده: <bdi className={styles.ip}>{session.ipAddress}</bdi></span>}
            </div>
          </div>
        </div>
        <div className={styles.sessionAction}>
          {status === "current" && <span className={styles.currentHint}>برای خروج از این دستگاه، از منوی حساب «خروج» را بزن.</span>}
          {status === "active" && <button type="button" className={styles.revokeButton}
            disabled={pending !== null || loadState !== "ready"}
            onClick={() => void revoke("single", session)}>
            {pending === session.id ? "در حال لغو…" : "قطع دسترسی"}
          </button>}
          {(status === "revoked" || status === "expired") && <span className={styles.archiveHint}>دسترسی ندارد</span>}
        </div>
      </article>
    );
  }

  return (
    <main className={styles.page} dir="rtl">
      <div className={styles.shell}>
        <nav className={styles.breadcrumb} aria-label="موقعیت صفحه">
          <Link href="/account">حساب من</Link><span aria-hidden="true">←</span><span>امنیت و دستگاه‌ها</span>
        </nav>
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>ACCOUNT SECURITY</span>
            <h1>امنیت حساب و دستگاه‌ها</h1>
            <p>نشست‌های واردشده به حسابت را ببین و در صورت نیاز دسترسی دستگاه‌های دیگر را قطع کن.</p>
          </div>
          <button type="button" className={styles.refreshButton} disabled={loadState === "loading" || pending !== null}
            onClick={() => void refresh()}>
            {loadState === "loading" ? "در حال دریافت…" : "تازه‌سازی"}
          </button>
        </header>

        {notice && <div className={styles.success} role="status">{notice}</div>}
        {error && <div className={styles.error} role="alert">{error}</div>}
        {loadState === "loading" && <div className={styles.message} role="status">در حال بررسی نشست‌های حساب…</div>}
        {loadState === "unauthorized" && (
          <div className={styles.message}>
            <strong>برای مدیریت امنیت حساب باید وارد شوی.</strong>
            <Link className={styles.primaryButton} href="/login?next=%2Faccount%2Fsessions">ورود به حساب</Link>
          </div>
        )}
        {loadState === "error" && <div className={styles.message}><button className={styles.primaryButton} onClick={() => void refresh()} type="button">تلاش دوباره</button></div>}

        {loadState === "ready" && (
          <>
            <section className={styles.overview} aria-label="خلاصه نشست‌ها">
              <div><span>نشست‌های فعال</span><strong>{active.length.toLocaleString("fa-IR")}</strong></div>
              <div><span>نشست‌های دیگر</span><strong>{active.filter((s) => !s.current).length.toLocaleString("fa-IR")}</strong></div>
              <div><span>نشست‌های قبلی</span><strong>{history.length.toLocaleString("fa-IR")}</strong></div>
            </section>
            <section className={styles.panel} aria-labelledby="active-sessions-title">
              <div className={styles.panelHead}>
                <div><h2 id="active-sessions-title">دستگاه‌های دارای دسترسی</h2><p>نشست فعلی مشخص است؛ قطع دسترسی دیگر دستگاه‌ها نیاز به تأیید تو دارد.</p></div>
                <button type="button" className={styles.revokeOthers}
                  disabled={!active.some((s) => !s.current) || pending !== null}
                  onClick={() => void revoke("others")}>{pending === "others" ? "در حال لغو…" : "خروج از همه دستگاه‌های دیگر"}</button>
              </div>
              {active.length === 0 ? <p className={styles.empty}>نشست فعالی برای نمایش وجود ندارد.</p> : <div className={styles.sessionList}>{active.map(renderSession)}</div>}
            </section>
            <section className={styles.panel} aria-labelledby="history-title">
              <div className={styles.panelHead}>
                <div><h2 id="history-title">تاریخچه نشست‌ها</h2><p>دستگاه‌هایی که دسترسی‌شان لغو شده یا نشست آن‌ها منقضی شده است.</p></div>
                <button className={styles.historyToggle} type="button" aria-expanded={showHistory} onClick={() => setShowHistory((value) => !value)}>
                  {showHistory ? "بستن تاریخچه" : `نمایش تاریخچه (${history.length.toLocaleString("fa-IR")})`}
                </button>
              </div>
              {showHistory && (history.length > 0 ? <div className={styles.sessionList}>{history.map(renderSession)}</div> : <p className={styles.empty}>هنوز نشست قبلی ثبت نشده است.</p>)}
            </section>
            <aside className={styles.footnote}>
              <strong>اطلاعات دستگاه چگونه ثبت می‌شود؟</strong>
              <p>نام دستگاه و IP به اطلاعات ثبت‌شده توسط سرور وابسته‌اند و ممکن است عمومی یا متعلق به پراکسی باشند. زمان «آخرین ثبت اطلاعات دستگاه» لزوماً آخرین فعالیت واقعی کاربر نیست. قطع دسترسی نشست، اعتبار ورود آن را در سرور لغو می‌کند.</p>
            </aside>
          </>
        )}
      </div>
    </main>
  );
}
