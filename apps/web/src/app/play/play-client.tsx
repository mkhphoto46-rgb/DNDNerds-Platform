"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "../account/account.module.css";
import play from "./play.module.css";

// Roadmap phase 10: the player's tables, invitations, a display name, and
// creating or joining a table. Game names (editions, roles) stay in English.
type TableRow = { id: string; name: string; edition: string; role: string };
type InviteRow = { id: string; tableId: string; name: string; edition: string; role: string };

export async function gameApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/game/${path}`, {
    credentials: "same-origin", cache: "no-store", ...init,
    headers: init.body ? { "Content-Type": "application/json", ...init.headers } : init.headers,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message ?? "درخواست ناموفق بود.") as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = body?.error?.code;
    throw error;
  }
  return body.data as T;
}

const ROLE_LABEL: Record<string, string> = { dm: "DM", player: "Player", observer: "Observer" };

export function PlayClient() {
  const [state, setState] = useState<"loading" | "guest" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [savedName, setSavedName] = useState<string | null>(null);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [name, setName] = useState("");
  const [edition, setEdition] = useState("2024");
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [joinCode, setJoinCode] = useState("");

  const refresh = useCallback(async () => {
    try {
      const profile = await gameApi<{ displayName: string | null }>("profile/display-name");
      setSavedName(profile.displayName);
      setDisplayName(profile.displayName ?? "");
      setTables(await gameApi<TableRow[]>("tables"));
      setInvites(await gameApi<InviteRow[]>("tables/invites/mine"));
      setState("ready");
    } catch (error) {
      if ((error as { status?: number }).status === 401) { setState("guest"); return; }
      setState("error");
      setMessage(error instanceof Error ? error.message : "خطای ارتباط با سرور");
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const act = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
      setMessage(done);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "درخواست ناموفق بود.");
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.hero}>
          <div className={styles.eyebrow}>D&D NERDS · WEB VTT</div>
          <h1>میزهای بازی من</h1>
          <p>میز بسازید، دوستان را دعوت کنید و با یک کلیک وارد Web VTT شوید.</p>
        </header>
        {state === "loading" && <section className={styles.notice} role="status">در حال بارگذاری…</section>}
        {state === "guest" && (
          <section className={styles.notice}>
            <h2>برای دیدن میزها وارد شوید</h2>
            <Link className={styles.buttonPrimary} href="/login?next=%2Fplay">ورود به حساب</Link>
          </section>
        )}
        {state === "error" && <section className={styles.notice} role="alert"><p>{message}</p></section>}
        {state === "ready" && (
          <div className={styles.content}>
            {message ? <p className={play.status} role="status">{message}</p> : null}
            <section className={styles.panel} aria-labelledby="display-name-heading">
              <h2 id="display-name-heading">نام نمایشی</h2>
              <p className={styles.hint}>این نام را بقیهٔ بازیکنان و Web VTT می‌بینند (۲ تا ۳۲ نویسه). ایمیل شما نمایش داده نمی‌شود.</p>
              <form className={play.form} onSubmit={(event) => { event.preventDefault(); void act(() => gameApi("profile/display-name", { method: "PUT", body: JSON.stringify({ displayName }) }), "نام نمایشی ذخیره شد."); }}>
                <label><span>نام نمایشی</span><input value={displayName} maxLength={32} onChange={(event) => setDisplayName(event.target.value)} /></label>
                <button className={styles.buttonPrimary} type="submit">ذخیره</button>
              </form>
            </section>

            <section className={styles.panel} aria-labelledby="tables-heading">
              <h2 id="tables-heading">میزهای من</h2>
              {tables.length ? (
                <ul className={play.list}>
                  {tables.map((table) => (
                    <li key={table.id}>
                      <Link href={`/play/${table.id}`}><strong>{table.name}</strong></Link>
                      <span>{ROLE_LABEL[table.role] ?? table.role} · D&D {table.edition === "mixed" ? "2014/2024" : table.edition}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className={styles.empty}>هنوز عضو هیچ میزی نیستید.</p>}
            </section>

            {invites.length ? (
              <section className={styles.panel} aria-labelledby="invites-heading">
                <h2 id="invites-heading">دعوت‌ها</h2>
                <ul className={play.list}>
                  {invites.map((invite) => (
                    <li key={invite.id}>
                      <strong>{invite.name}</strong>
                      <span>{ROLE_LABEL[invite.role] ?? invite.role} · D&D {invite.edition}</span>
                      <div className={play.buttons}>
                        <button type="button" className={styles.buttonPrimary} onClick={() => void act(() => gameApi(`tables/invites/${invite.id}/accept`, { method: "POST", body: "{}" }), "به میز پیوستید.")}>پذیرفتن</button>
                        <button type="button" className={styles.inlineButton} onClick={() => void act(() => gameApi(`tables/invites/${invite.id}/decline`, { method: "POST", body: "{}" }), "دعوت رد شد.")}>رد کردن</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className={styles.panel} aria-labelledby="create-heading">
              <h2 id="create-heading">ساختن میز (DM)</h2>
              {!savedName ? <p className={styles.hint}>اول یک نام نمایشی انتخاب کنید.</p> : null}
              <form className={play.form} onSubmit={(event) => { event.preventDefault(); void act(() => gameApi("tables", { method: "POST", body: JSON.stringify({ name, edition, maxPlayers }) }), "میز ساخته شد."); }}>
                <label><span>نام میز</span><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label>
                <label><span>ویرایش قوانین</span>
                  <select value={edition} onChange={(event) => setEdition(event.target.value)}>
                    <option value="2024">D&D 2024</option>
                    <option value="2014">D&D 2014</option>
                    <option value="mixed">2014 + 2024</option>
                  </select>
                </label>
                <label><span>بیشترین تعداد بازیکن</span><input type="number" min={1} max={9} value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value) || 1)} /></label>
                <button className={styles.buttonPrimary} type="submit" disabled={!savedName}>ساختن</button>
              </form>
            </section>

            <section className={styles.panel} aria-labelledby="join-heading">
              <h2 id="join-heading">پیوستن با کد</h2>
              <form className={play.form} onSubmit={(event) => { event.preventDefault(); void act(() => gameApi("tables/join", { method: "POST", body: JSON.stringify({ joinCode }) }), "به میز پیوستید."); }}>
                <label><span>کد میز</span><input value={joinCode} maxLength={8} dir="ltr" onChange={(event) => setJoinCode(event.target.value.toUpperCase())} /></label>
                <button className={styles.buttonPrimary} type="submit" disabled={!savedName}>پیوستن</button>
              </form>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
