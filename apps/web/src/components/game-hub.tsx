"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "./game-hub.module.css";

type GameSession = { id: string; number: number; startedAt: string; endedAt: string | null };
type SessionStatus = { onlineCount: number; activeSession: GameSession | null; recentSessions: GameSession[] } | null;
type Table = { id: string; hostUserId: string; hostName?: string | null; title: string; description: string; system: string; language: string; playStyle: string; levelRange: string; schedule: string; capacity: number; visibility: "PUBLIC" | "PRIVATE"; status?: string; updatedAt?: string; sessionStatus?: SessionStatus; rating?: number | null; reviewCount?: number };
type Profile = { userId: string; displayName: string; bio: string; playStyle: string; languages: string; experienceYears: number; visible?: boolean; rating?: number | null; reviewCount?: number };
type Application = { id: string; tableId: string; title?: string; note: string; status: string; tableStatus?: string; tableUpdatedAt?: string; sessionStatus?: SessionStatus; email?: string };
type Listing = { id: string; ownerUserId: string; opponentUserId?: string | null; mode: string; title: string; note: string; status: string };
type Mine = { hosted: Table[]; applications: Application[] };
type Mode = "find-game" | "find-dm" | "play" | "create-game" | "arena";

async function request<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(`/api/game-hub/${path}`, { method, cache: "no-store", headers: data ? { "Content-Type": "application/json" } : undefined, body: data ? JSON.stringify(data) : undefined });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? "درخواست انجام نشد.");
  return body.data as T;
}
const headings: Record<Mode, { eyebrow: string; title: string; description: string }> = {
  "find-game": { eyebrow: "میزهای بازی · Player", title: "کمپین بعدی‌ات را پیدا کن", description: "میزهای عمومی را ببین و مستقیم با نمای بازیکن وارد شو؛ برای میز خصوصی از کد دعوت استفاده کن." },
  "find-dm": { eyebrow: "راهنمایان بازی", title: "DM مناسب گروهت را پیدا کن", description: "سبک اجرا، زبان و سابقه Dungeon Masters را پیش از انتخاب میز ببین." },
  play: { eyebrow: "بازی‌های من", title: "میزهای من", description: "میزهایی که میزبانی می‌کنی و بازی‌هایی که در آن‌ها عضو هستی، همراه با سشن‌های فعال و گذشته." },
  "create-game": { eyebrow: "میز تازه · DM", title: "ساخت بازی", description: "مشخصات میز را ثبت کن، سپس از «میزهای من» با نمای DM وارد بازی شو." },
  arena: { eyebrow: "آرنا", title: "برای رقابت هم‌گروه پیدا کن", description: "دعوت رقابت ثبت کن یا به دعوت دیگری بپیوند. اجرای نبرد بعد از اتصال WebVTT فعال می‌شود." },
};

const tableStatusNames: Record<string, string> = { DRAFT: "پیش‌نویس", PUBLISHED: "باز برای بازی", CLOSED: "پایان‌یافته", HIDDEN: "پنهان" };
const applicationStatusNames: Record<string, string> = { PENDING: "در انتظار پذیرش", ACCEPTED: "عضو میز", DECLINED: "پذیرفته‌نشده", WITHDRAWN: "انصراف‌داده" };
const sessionDate = (value: string) => new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(value));

function SessionSummary({ status }: { status?: SessionStatus }) {
  if (!status) return <p className={styles.sessionInfo}>وضعیت سشن‌های بازی فعلاً در دسترس نیست.</p>;
  return <div className={styles.sessionInfo}>
    {status.activeSession ? <p><strong>سشن {status.activeSession.number} فعال</strong> · {status.onlineCount} نفر آنلاین</p> : <p>سشن فعالی در حال اجرا نیست.</p>}
    {status.recentSessions.length > 0 ? <details><summary>سشن‌های قبلی ({status.recentSessions.filter(session => session.endedAt).length})</summary><ul>{status.recentSessions.filter(session => session.endedAt).slice(0, 5).map(session => <li key={session.id}>سشن {session.number} · {sessionDate(session.startedAt)}</li>)}</ul></details> : <small>هنوز سشنی ثبت نشده است.</small>}
  </div>;
}

export function GameHub({ mode }: { mode: Mode }) {
  const [tables, setTables] = useState<Table[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [mine, setMine] = useState<Mine | null>(null);
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [gamePage, setGamePage] = useState(1);
  const [gameSort, setGameSort] = useState<"newest" | "rating">("newest");
  const [profileForm, setProfileForm] = useState({ displayName: "", bio: "", playStyle: "داستان‌محور", languages: "فارسی", experienceYears: 0, visible: true });
  const [tableForm, setTableForm] = useState({ title: "", description: "", system: "D&D 5e", language: "فارسی", playStyle: "داستان‌محور", levelRange: "1 تا 5", schedule: "با هماهنگی گروه", capacity: 4, status: "DRAFT", visibility: "PUBLIC" as "PUBLIC" | "PRIVATE" });
  const [inviteCode, setInviteCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [editTableId, setEditTableId] = useState<string | null>(null);
  const [arenaForm, setArenaForm] = useState({ mode: "1V1", title: "", note: "" });
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let current = true;
    void fetch("/api/auth/me", { cache: "no-store" }).then(response => { if (current) setSignedIn(response.ok); }).catch(() => { if (current) setSignedIn(false); });
    return () => { current = false; };
  }, []);

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try {
      if (mode === "find-game") setTables(await request<Table[]>("tables"));
      if (mode === "find-dm") {
        setProfiles(await request<Profile[]>("dms"));
        try { const own = await request<Profile | null>("dms/me"); setMyProfile(own); if (own) setProfileForm({ ...own, visible: own.visible ?? true }); } catch { /* Guest can still browse. */ }
      }
      if (mode === "play" || mode === "create-game") {
        try {
          const own = await request<Mine>("tables/me");
          setMine(own);
          if (mode === "create-game") {
            const editId = new URLSearchParams(window.location.search).get("edit");
            const table = own.hosted.find(item => item.id === editId);
            if (table) {
              setEditTableId(table.id);
              setTableForm({ title: table.title, description: table.description, system: table.system, language: table.language, playStyle: table.playStyle, levelRange: table.levelRange, schedule: table.schedule, capacity: table.capacity, visibility: table.visibility, status: table.status === "HIDDEN" ? "DRAFT" : table.status ?? "DRAFT" });
            }
          }
        } catch { setMine(null); }
      }
      if (mode === "arena") {
        setListings(await request<Listing[]>("arena"));
        try { setMyListings(await request<Listing[]>("arena/me")); } catch { setMyListings([]); }
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "بارگذاری ناموفق بود."); }
    finally { setLoading(false); }
  }, [mode]);
  useEffect(() => { void reload(); }, [reload]);

  async function act(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(message); await reload(); if (selected) setApplications(await request<Application[]>(`tables/${selected}/applications`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "درخواست انجام نشد."); }
    finally { setBusy(false); }
  }

  async function launch(tableId: string, role: "dm" | "player") {
    setBusy(true); setError("");
    try {
      const result = await request<{ url: string }>(`tables/${tableId}/launch`, "POST", { role });
      window.location.assign(result.url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "ورود به بازی انجام نشد."); setBusy(false); }
  }

  async function joinWithCode() {
    setBusy(true); setError("");
    try {
      const table = await request<Table>("tables/join-by-code", "POST", { code: codeInput });
      const result = await request<{ url: string }>(`tables/${table.id}/launch`, "POST", { role: "player" });
      window.location.assign(result.url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "کد دعوت پذیرفته نشد."); setBusy(false); }
  }

  const heading = headings[mode];
  const visibleGames = mode === "find-game" ? tables.filter(table => `${table.title} ${table.system} ${table.playStyle} ${table.hostName ?? ""}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase())).sort((a, b) => gameSort === "rating" ? (b.rating ?? 0) - (a.rating ?? 0) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0) : 0) : [];
  const gamesPerPage = 12;
  return <main className={styles.page}>
    <div className="shell">
      <header className={styles.intro}><span className="section-kicker">{heading.eyebrow}</span><h1>{heading.title}</h1><p>{heading.description}</p></header>
      <nav className={styles.tabs} aria-label="بخش‌های بازی"><Link href="/play" aria-current={mode === "play" ? "page" : undefined}>میزهای من</Link><Link href="/find-game" aria-current={mode === "find-game" ? "page" : undefined}>پیدا کردن بازی</Link><Link href="/create-game" aria-current={mode === "create-game" ? "page" : undefined}>ساخت بازی</Link></nav>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      {loading && <p role="status">در حال بارگذاری…</p>}
      {(["find-game", "play", "create-game"] as Mode[]).includes(mode) && signedIn === false && <section className={styles.panel}><h2>برای بازی، اول وارد حساب شو</h2><p>ساخت میز و پیوستن به بازی با حساب فعال سایت انجام می‌شود.</p><div className={styles.actions}><Link href={`/register?next=${encodeURIComponent(mode === "create-game" ? "/create-game" : mode === "play" ? "/play" : "/find-game")}`}>ساخت حساب</Link><Link href={`/login?next=${encodeURIComponent(mode === "create-game" ? "/create-game" : mode === "play" ? "/play" : "/find-game")}`}>حساب دارم؛ ورود</Link></div></section>}

      {mode === "find-game" && !loading && <>
        {signedIn && <section className={styles.panel}><h2>ورود به میز خصوصی</h2><p>کد دعوتی را که DM فرستاده وارد کن تا با نمای Player وارد شوی.</p><form onSubmit={event => { event.preventDefault(); void joinWithCode(); }}><label>کد دعوت<input required value={codeInput} onChange={event => setCodeInput(event.target.value.toUpperCase())} autoComplete="off" /></label><button disabled={busy}>ورود با کد</button></form></section>}
        <div className={styles.listToolbar}><input className={styles.search} aria-label="جستجوی میز" placeholder="جستجو در عنوان، سیستم یا نام DM" value={filter} onChange={event => { setFilter(event.target.value); setGamePage(1); }} /><label>چینش <select value={gameSort} onChange={event => { setGameSort(event.target.value as "newest" | "rating"); setGamePage(1); }}><option value="newest">تازه‌ترین</option><option value="rating">بالاترین امتیاز</option></select></label><span>{visibleGames.length} کمپین</span></div>
        <div className={styles.gameGrid}>{visibleGames.slice((gamePage - 1) * gamesPerPage, gamePage * gamesPerPage).map(table => <article className={styles.gameCard} key={table.id}>
          <small>{table.system} · {table.language} · {table.levelRange}</small><h2>{table.title}</h2><p>{table.description || "DM هنوز توضیحی برای این میز ننوشته است."}</p>
          <div className={styles.gameCardFooter}><span>DM: {table.hostName || "میزبان"}</span><span className={styles.rating}>★ {table.reviewCount ? `${table.rating} (${table.reviewCount})` : "بدون امتیاز"}</span></div>
          <Link className={styles.detailLink} href={`/find-game/${table.id}`}>دیدن جزئیات کمپین ←</Link>
        </article>)}</div>
        {visibleGames.length > gamesPerPage && <nav className={styles.pagination} aria-label="صفحه‌های کمپین"><button disabled={gamePage === 1} onClick={() => setGamePage(page => page - 1)}>صفحهٔ پیشین</button><span>صفحهٔ {gamePage} از {Math.ceil(visibleGames.length / gamesPerPage)}</span><button disabled={gamePage * gamesPerPage >= visibleGames.length} onClick={() => setGamePage(page => page + 1)}>صفحهٔ بعدی</button></nav>}
        {!tables.length && <div className={styles.empty}>هنوز میز منتشرشده‌ای وجود ندارد. اگر DM هستی، نخستین میز را بساز. <Link href="/play">ساخت میز</Link></div>}
      </>}

      {mode === "find-dm" && !loading && <>
        <div className={styles.grid}>{profiles.map((profile, index) => <article className={styles.card} key={profile.userId}><small>Dungeon Master · {profile.reviewCount ? `رتبهٔ ${index + 1}` : "بدون رتبه"}</small><h2>{profile.displayName}</h2><p className={styles.rating}>★ {profile.reviewCount ? `${profile.rating} از ۵ · ${profile.reviewCount} نظر` : "هنوز امتیازی ثبت نشده"}</p><p>{profile.bio || "این DM هنوز معرفی کوتاهی ثبت نکرده است."}</p><div className={styles.meta}><span>{profile.playStyle}</span><span>{profile.languages}</span><span>{profile.experienceYears} سال تجربه</span></div><Link href="/find-game">دیدن میزها ←</Link></article>)}</div>
        {!profiles.length && <div className={styles.empty}>هنوز پروفایل DM منتشر نشده است.</div>}
        <section className={styles.panel}><h2>پروفایل DM خودت</h2><p>برای دیده‌شدن در این فهرست، مشخصاتت را ثبت کن.</p><form className={styles.profileForm} onSubmit={event => { event.preventDefault(); void act(() => request("dms/me", "PUT", profileForm), "پروفایل DM ذخیره شد."); }}>
          <label>نام نمایشی<input required minLength={2} value={profileForm.displayName} onChange={e => setProfileForm({ ...profileForm, displayName: e.target.value })} /></label>
          <label>معرفی<textarea rows={1} placeholder="معرفی کوتاه خودت را بنویس" value={profileForm.bio} maxLength={1200} onChange={e => setProfileForm({ ...profileForm, bio: e.target.value })} /></label>
          <label>سبک اجرا<input required value={profileForm.playStyle} onChange={e => setProfileForm({ ...profileForm, playStyle: e.target.value })} /></label>
          <label>زبان<input required value={profileForm.languages} onChange={e => setProfileForm({ ...profileForm, languages: e.target.value })} /></label>
          <label>سال تجربه<input type="number" min="0" max="60" value={profileForm.experienceYears} onChange={e => setProfileForm({ ...profileForm, experienceYears: Number(e.target.value) })} /></label>
          <label className={styles.check}><input type="checkbox" checked={profileForm.visible} onChange={e => setProfileForm({ ...profileForm, visible: e.target.checked })} /> نمایش عمومی</label>
          <button disabled={busy}>ذخیره پروفایل</button>{myProfile && <small>پروفایل ثبت شده است.</small>}
        </form></section>
      </>}

      {(mode === "play" || mode === "create-game") && !loading && <>
        {!mine && signedIn && <div className={styles.empty}>میزهای تو بارگذاری نشدند. صفحه را تازه‌سازی کن.</div>}
        {mine && <>{mode === "create-game" && <section className={styles.panel}><h2>{editTableId ? "ویرایش میز" : "میز تازه"}</h2><form onSubmit={event => { event.preventDefault(); void act(async () => { const result = await request<{ inviteCode?: string | null }>(editTableId ? `tables/${editTableId}` : "tables", editTableId ? "PUT" : "POST", tableForm); setInviteCode(result.inviteCode ?? ""); }, editTableId ? "میز ویرایش شد." : "میز ساخته شد."); }}>
          <label>عنوان میز<input required minLength={3} value={tableForm.title} onChange={e => setTableForm({ ...tableForm, title: e.target.value })} /></label>
          <details className={styles.expandField} open={editTableId ? true : undefined}><summary>درباره کمپین <span>توضیحات کامل را اینجا بنویس</span></summary><label>توضیحات کمپین<textarea maxLength={2000} value={tableForm.description} onChange={e => setTableForm({ ...tableForm, description: e.target.value })} /></label></details>
          <label>سیستم بازی<input required value={tableForm.system} onChange={e => setTableForm({ ...tableForm, system: e.target.value })} /></label>
          <label>زبان<input required value={tableForm.language} onChange={e => setTableForm({ ...tableForm, language: e.target.value })} /></label>
          <label>سبک<input required value={tableForm.playStyle} onChange={e => setTableForm({ ...tableForm, playStyle: e.target.value })} /></label>
          <label>بازه سطح<input required value={tableForm.levelRange} onChange={e => setTableForm({ ...tableForm, levelRange: e.target.value })} /></label>
          <label>زمان‌بندی<input required value={tableForm.schedule} onChange={e => setTableForm({ ...tableForm, schedule: e.target.value })} /></label>
          <label>ظرفیت<input type="number" lang="en" dir="ltr" min="2" max="8" value={tableForm.capacity} onChange={e => setTableForm({ ...tableForm, capacity: Number(e.target.value) })} /></label>
          <label>نوع نمایش<select value={tableForm.visibility} onChange={e => setTableForm({ ...tableForm, visibility: e.target.value as "PUBLIC" | "PRIVATE" })}><option value="PUBLIC">عمومی؛ در فهرست بازی‌ها</option><option value="PRIVATE">خصوصی؛ فقط با کد دعوت</option></select></label>
          <label>وضعیت<select value={tableForm.status} onChange={e => setTableForm({ ...tableForm, status: e.target.value })}><option value="DRAFT">پیش‌نویس</option><option value="PUBLISHED">منتشرشده</option><option value="CLOSED">بسته</option></select></label>
          <button disabled={busy}>{editTableId ? "ذخیره تغییرات" : "ساخت میز"}</button>{editTableId && <button type="button" onClick={() => setEditTableId(null)}>لغو ویرایش</button>}
        </form>{inviteCode && <p className={styles.notice}>کد دعوت خصوصی: <strong dir="ltr">{inviteCode}</strong> — آن را برای دوستانت بفرست. این کد پس از بستن صفحه دوباره نمایش داده نمی‌شود.</p>}<p><Link href="/play">بازگشت به میزهای من ←</Link></p></section>}
        {mode === "play" && <><div className={styles.actions}><Link href="/create-game">ساخت بازی تازه ←</Link><Link href="/find-game">پیدا کردن بازی ←</Link></div>
        <h2>میزهای میزبانی‌شده</h2><div className={styles.grid}>{mine.hosted.map(table => <article className={styles.card} key={table.id}><small>{tableStatusNames[table.status ?? ""] ?? table.status} · {table.visibility === "PRIVATE" ? "خصوصی" : "عمومی"}</small><h3>{table.title}</h3><p>{table.description}</p><SessionSummary status={table.sessionStatus} /><div className={styles.actions}><button disabled={busy} onClick={() => window.location.assign(`/create-game?edit=${encodeURIComponent(table.id)}`)}>ویرایش</button><button disabled={busy || table.status === "HIDDEN"} onClick={() => void act(() => request(`tables/${table.id}`, "PUT", { title: table.title, description: table.description, system: table.system, language: table.language, playStyle: table.playStyle, levelRange: table.levelRange, schedule: table.schedule, capacity: table.capacity, visibility: table.visibility, status: table.status === "PUBLISHED" ? "CLOSED" : "PUBLISHED" }), "وضعیت میز تغییر کرد.")}>{table.status === "PUBLISHED" ? "بستن میز" : "انتشار میز"}</button><button disabled={busy} onClick={() => void launch(table.id, "dm")}>ورود به نمای DM</button>{table.visibility === "PRIVATE" && <button disabled={busy} onClick={() => void act(async () => { const result = await request<{inviteCode: string}>(`tables/${table.id}/invite/rotate`, "POST"); setInviteCode(result.inviteCode); }, "کد دعوت تازه ساخته شد؛ کد قبلی دیگر کار نمی‌کند.")}>ساخت کد دعوت تازه</button>}<button disabled={busy} onClick={() => { setSelected(table.id); void request<Application[]>(`tables/${table.id}/applications`).then(setApplications).catch(e => setError(e.message)); }}>اعضا</button></div></article>)}</div>
        {selected && <section className={styles.panel}><h2>درخواست‌های میز</h2>{applications.map(application => <div key={application.id} className={styles.application}><strong>{application.email}</strong><span>{application.note || "بدون پیام"}</span><small>{application.status}</small>{application.status === "PENDING" && <div className={styles.actions}><button disabled={busy} onClick={() => void act(() => request(`applications/${application.id}/respond`, "POST", { accept: true }), "درخواست پذیرفته شد.")}>پذیرش</button><button disabled={busy} onClick={() => void act(() => request(`applications/${application.id}/respond`, "POST", { accept: false }), "درخواست رد شد.")}>رد</button></div>}</div>)}{!applications.length && <p>درخواستی ثبت نشده است.</p>}</section>}
        <h2>بازی‌هایی که در آن‌ها عضو هستم</h2><div className={styles.grid}>{mine.applications.map(application => <article className={styles.card} key={application.id}><h3>{application.title}</h3><p>{applicationStatusNames[application.status] ?? application.status} · {tableStatusNames[application.tableStatus ?? ""] ?? application.tableStatus}</p><SessionSummary status={application.sessionStatus} />{application.status === "ACCEPTED" && application.tableStatus === "PUBLISHED" && <button disabled={busy} onClick={() => void launch(application.tableId, "player")}>ورود به نمای Player</button>}{["PENDING", "ACCEPTED"].includes(application.status) && <button disabled={busy} onClick={() => void act(() => request(`applications/${application.id}/withdraw`, "POST"), "درخواست پس گرفته شد.")}>پس‌گرفتن درخواست</button>}</article>)}</div>
        </>}
        </>}
      </>}

      {mode === "arena" && !loading && <>
        <section className={styles.panel}><h2>دعوت تازه</h2><form className={styles.arenaForm} onSubmit={event => { event.preventDefault(); void act(() => request("arena", "POST", arenaForm), "دعوت آرنا ثبت شد."); }}><label>عنوان<input required minLength={3} value={arenaForm.title} onChange={e => setArenaForm({ ...arenaForm, title: e.target.value })} /></label><label>حالت<select value={arenaForm.mode} onChange={e => setArenaForm({ ...arenaForm, mode: e.target.value })}><option value="1V1">1v1</option><option value="2V2">2v2</option><option value="3V3">3v3</option></select></label><label className={styles.fullRow}>توضیحات<textarea maxLength={500} value={arenaForm.note} onChange={e => setArenaForm({ ...arenaForm, note: e.target.value })} /></label><div className={styles.formActions}><button disabled={busy}>ثبت دعوت</button></div></form></section>
        <h2>دعوت‌های باز</h2><div className={styles.grid}>{listings.map(listing => <article className={styles.card} key={listing.id}><small>{listing.mode}</small><h3>{listing.title}</h3><p>{listing.note || "بدون توضیح"}</p><button disabled={busy} onClick={() => void act(() => request(`arena/${listing.id}/join`, "POST"), "به دعوت پیوستی. اجرای بازی پس از اتصال WebVTT فعال می‌شود.")}>پیوستن</button></article>)}</div>
        {!listings.length && <div className={styles.empty}>هنوز دعوت بازی وجود ندارد.</div>}
        {!!myListings.length && <><h2>دعوت‌های من</h2><div className={styles.grid}>{myListings.map(listing => <article className={styles.card} key={listing.id}><h3>{listing.title}</h3><p>{listing.mode} · {listing.status}</p>{listing.status === "OPEN" && <button disabled={busy} onClick={() => void act(() => request(`arena/${listing.id}/cancel`, "POST"), "دعوت لغو شد.")}>لغو دعوت</button>}</article>)}</div></>}
      </>}
    </div>
  </main>;
}
