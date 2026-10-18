"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./account-status.module.css";

type AccountUser = { id: string; email: string };
type SessionState =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "signed-in"; user: AccountUser }
  | { kind: "error" };

export function AccountStatus({ mobile = false }: { mobile?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<SessionState>({ kind: "loading" });
  const [signingOut, setSigningOut] = useState(false);
  const latestRequest = useRef(0);

  const checkSession = useCallback(async () => {
    const requestId = ++latestRequest.current;
    try {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (requestId !== latestRequest.current) return;
      if (response.status === 401) {
        setState({ kind: "guest" });
        return;
      }
      if (!response.ok) {
        setState({ kind: "error" });
        return;
      }
      const data: { user?: AccountUser } = await response.json();
      if (requestId !== latestRequest.current) return;
      if (data.user?.id && data.user?.email) {
        setState({ kind: "signed-in", user: data.user });
      } else {
        setState({ kind: "error" });
      }
    } catch {
      if (requestId === latestRequest.current) setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession, pathname]);

  useEffect(() => {
    const refresh = () => { void checkSession(); };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("dnd-auth-change", refresh);
    document.addEventListener("visibilitychange", onVisible);
    let channel: BroadcastChannel | undefined;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("dnd-nerds-auth-state");
      channel.onmessage = (event: MessageEvent) => {
        if (event.data === "auth-change") refresh();
      };
    }
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("dnd-auth-change", refresh);
      document.removeEventListener("visibilitychange", onVisible);
      channel?.close();
    };
  }, [checkSession]);

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("LOGOUT_FAILED");
      setState({ kind: "guest" });
      window.dispatchEvent(new Event("dnd-auth-change"));
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel("dnd-nerds-auth-state");
        channel.postMessage("auth-change");
        channel.close();
      }
      router.replace("/");
      router.refresh();
    } catch {
      setState({ kind: "error" });
    } finally {
      setSigningOut(false);
    }
  }

  if (state.kind === "loading") {
    return <span className={styles.loading} aria-live="polite">در حال بررسی حساب…</span>;
  }
  if (state.kind === "error") {
    return (
      <button type="button" className={styles.retry} onClick={() => void checkSession()}>
        بررسی اتصال حساب
      </button>
    );
  }
  if (state.kind === "guest") {
    return (
      <div className={`${styles.guestActions} ${mobile ? styles.mobile : ""}`}>
        <Link className={styles.textLink} href="/login">ورود</Link>
        <Link className={styles.primaryLink} href="/register">ساخت حساب</Link>
      </div>
    );
  }
  return (
    <details className={`${styles.menu} ${mobile ? styles.mobile : ""}`}>
      <summary className={styles.trigger} title={state.user.email}>
        <span className={styles.avatar} aria-hidden="true">{state.user.email.slice(0, 1).toUpperCase()}</span>
        <span className={styles.accountLabel}>حساب من <span className={styles.email}>{state.user.email}</span></span>
      </summary>
      <div className={styles.panel}>
        <span className={styles.panelEmail}>{state.user.email}</span>
        <Link href="/account">نمای کلی حساب من</Link>
        <Link href="/orders">تاریخچه خرید و سفارش‌ها</Link>
        <Link href="/account/sessions">امنیت و نشست‌های حساب</Link>
        <button type="button" disabled={signingOut} onClick={() => void signOut()}>
          {signingOut ? "در حال خروج…" : "خروج از حساب"}
        </button>
      </div>
    </details>
  );
}
