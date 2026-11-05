"use client";

import { fetchSession } from "@/lib/session-client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { prepareProfileImage } from "@/lib/profile-pages";
import styles from "./game-hub.module.css";
import { CoverImage, DmCard, Reactions, RecentReviews, DeleteCampaign, type FeedbackSummary, type FeedbackReview } from "./discovery";
import { useVisibleRefresh, invalidateDiscovery } from "@/lib/use-visible-refresh";
import { apiErrorMessage } from "@/lib/api-error";
import { singleFlight } from "@/lib/single-flight";

type GameSession = { id: string; number: number; startedAt: string; endedAt: string | null };
type SessionStatus = { onlineCount: number; activeSession: GameSession | null; recentSessions: GameSession[] } | null;
const genreChoices = ["فانتزی", "ماجراجویی", "وحشت", "معمایی", "علمی‌تخیلی", "حماسی", "طنز", "تاریخی", "نقش‌آفرینی", "نبردمحور"];

type Table = FeedbackSummary & { deletionPending?: boolean; recentReviews?: FeedbackReview[]; hostPublicId?: string; genres?: string[]; imageData?: string | null; hostUsername?: string | null; id: string; hostUserId: string; hostName?: string | null; title: string; description: string; system: string; language: string; playStyle: string; levelRange: string; schedule: string; capacity: number; visibility: "PUBLIC" | "PRIVATE"; status?: string; updatedAt?: string; sessionStatus?: SessionStatus; reviewCount?: number };
type Profile = FeedbackSummary & { bannerData?: string | null; recentReviews?: FeedbackReview[]; username?: string | null; publicId?: string; userId: string; displayName: string; bio: string; playStyle: string; languages: string; experienceYears: number; avatarData?: string | null; reviewCount?: number };
type Application = { id: string; tableId: string; title?: string; note: string; status: string; tableStatus?: string; tableUpdatedAt?: string; sessionStatus?: SessionStatus; email?: string };
type Listing = { id: string; ownerUserId: string; opponentUserId?: string | null; mode: string; title: string; note: string; status: string; playerCount?: number; playerLimit?: number };
const arenaFill = (listing: Listing) => listing.playerLimit ? ` · ${listing.playerCount ?? 1}/${listing.playerLimit} بازیکن` : "";
type Mine = { hosted: Table[]; applications: Application[] };
type Mode = "find-game" | "find-dm" | "play" | "create-game" | "arena";

async function request<T>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(`/api/game-hub/${path}`, { method, cache: "no-store", headers: data ? { "Content-Type": "application/json" } : undefined, ...(data ? { body: JSON.stringify(data) } : {}) });
  const body = await response.json();
  if (!response.ok) throw new Error(apiErrorMessage(body, "درخواست انجام نشد.", response.status));
  return body.data as T;
}
const headings: Record<Mode, { eyebrow: string; title: string; description: string }> = {
  "find-game": { eyebrow: "میزهای بازی · Player", title: "کمپین بعدی‌ات را پیدا کن", description: "میزهای عمومی را ببین و مستقیم با نمای بازیکن وارد شو؛ برای میز خصوصی از کد دعوت استفاده کن." },
  "find-dm": { eyebrow: "راهنمایان بازی", title: "DM مناسب گروهت را پیدا کن", description: "سبک اجرا، زبان و سابقه Dungeon Masters را پیش از انتخاب میز ببین." },
  play: { eyebrow: "بازی‌های من", title: "میزهای من", description: "میزهایی که میزبانی می‌کنی و بازی‌هایی که در آن‌ها عضو هستی، همراه با سشن‌های فعال و گذشته." },
  "create-game": { eyebrow: "میز تازه · DM", title: "ساخت میز", description: "مشخصات میز را ثبت کن، سپس از «میزهای من» با نمای DM وارد بازی شو." },
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
  const inAccount = usePathname().startsWith("/account/");
  const routes = inAccount ? { play: "/account/games", find: "/account/find-game", create: "/account/create-game" } : { play: "/play", find: "/find-game", create: "/create-game" };
  const [tables, setTables] = useState<Table[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [mine, setMine] = useState<Mine | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [genre, setGenre] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchVersion = useRef(0);
  const initializedEdit = useRef<string | null>(null);
  useEffect(() => { const timer = setTimeout(() => setSearchQuery(filter), 250); return () => clearTimeout(timer); }, [filter]);
  const [gamePage, setGamePage] = useState(1);
  const [gameSort, setGameSort] = useState<"newest" | "likes">("newest");
  const emptyTableForm = () => ({ genres: [] as string[], imageData: null as string | null, title: "", description: "", system: "D&D 5e", language: "فارسی", playStyle: "داستان‌محور", levelRange: "1 تا 5", schedule: "با هماهنگی گروه", capacity: 4, status: "DRAFT", visibility: "PUBLIC" as "PUBLIC" | "PRIVATE" });
  const [tableForm, setTableForm] = useState(emptyTableForm);
  const messageRef = useRef<HTMLDivElement>(null);
  // B74: show the result where the DM is looking.
  useEffect(() => { if (notice || error) messageRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [notice, error]);
  const [inviteCode, setInviteCode] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [editTableId, setEditTableId] = useState<string | null>(null);
  const [arenaForm, setArenaForm] = useState({ mode: "1V1", title: "", note: "" });
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [returnTo, setReturnTo] = useState("");
  useEffect(() => { setReturnTo(window.location.pathname + window.location.search + window.location.hash); }, []);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let current = true;
    void fetchSession().then(response => { if (current) setSignedIn(response.ok); }).catch(() => { if (current) setSignedIn(false); });
    return () => { current = false; };
  }, []);

  const reload = useCallback(async () => {
    const version = ++searchVersion.current; setError("");
    try {
      if (mode === "find-game") { const query = new URLSearchParams({ q: searchQuery, genre }); const [games, dms] = await Promise.all([request<Table[]>(`tables?${query}`), request<Profile[]>(`dms?${query}`)]); if (version === searchVersion.current) { setTables(games); setProfiles(dms); } }
      if (mode === "find-dm") { const dms = await request<Profile[]>(`dms?${new URLSearchParams({ q: searchQuery })}`); if (version === searchVersion.current) setProfiles(dms); }
      if (mode === "play" || mode === "create-game") {
        try {
          const own = await request<Mine>("tables/me");
          setMine(own);
          if (mode === "create-game") {
            const editId = new URLSearchParams(window.location.search).get("edit");
            const table = own.hosted.find(item => item.id === editId);
            if (table && initializedEdit.current !== table.id) {
              initializedEdit.current = table.id;
              setEditTableId(table.id);
              setTableForm({ genres: table.genres ?? [], imageData: table.imageData ?? null, title: table.title, description: table.description, system: table.system, language: table.language, playStyle: table.playStyle, levelRange: table.levelRange, schedule: table.schedule, capacity: table.capacity, visibility: table.visibility, status: table.status === "HIDDEN" ? "DRAFT" : table.status ?? "DRAFT" });
            }
          }
        } catch { setMine(null); }
      }
      if (mode === "arena") {
        setListings(await request<Listing[]>("arena"));
        try { setMyListings(await request<Listing[]>("arena/me")); } catch { setMyListings([]); }
      }
    } catch (reason) { if (version === searchVersion.current) setError(reason instanceof Error ? reason.message : "بارگذاری ناموفق بود."); }
    finally { if (version === searchVersion.current) setLoading(false); }
  }, [mode, searchQuery, genre]);
  const refresh = useVisibleRefresh(reload);

  // B74: one save at a time; a new table clears the form so a second click can't duplicate it.
  const saveTableRun = useRef<() => Promise<void>>(async () => {});
  const saveTable = useRef(singleFlight(() => saveTableRun.current())).current;
  saveTableRun.current = async () => {
    const editing = editTableId;
    await act(async () => {
      const result = await request<{ inviteCode?: string | null }>(editing ? `tables/${editing}` : "tables", editing ? "PUT" : "POST", tableForm);
      setInviteCode(result.inviteCode ?? "");
      if (!editing) setTableForm(emptyTableForm());
    }, editing ? "میز ویرایش شد." : "میز ساخته شد.");
  };

  async function act(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(message); invalidateDiscovery(); if (selected) setApplications(await request<Application[]>(`tables/${selected}/applications`)); }
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
      const table = await request<Table | { launchUrl: string }>("tables/join-by-code", "POST", { code: codeInput });
      if ("launchUrl" in table) { window.location.assign(table.launchUrl); return; }
      const result = await request<{ url: string }>(`tables/${table.id}/launch`, "POST", { role: "player" });
      window.location.assign(result.url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "کد دعوت پذیرفته نشد."); setBusy(false); }
  }

  const heading = headings[mode];
  const visibleGames = mode === "find-game" ? [...tables].sort((a, b) => gameSort === "likes" ? (b.likes ?? 0) - (a.likes ?? 0) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0) : 0) : [];
  const gamesPerPage = 12;
  return <main className={styles.page}>
    <div className="shell">
      <nav className={styles.localNav} aria-label="مسیر بازی"><Link href="/games">بازی‌ها</Link><span aria-hidden="true"> / </span><span>{headings[mode].title}</span></nav>
      <header className={styles.intro}><span className="section-kicker">{heading.eyebrow}</span><h1>{heading.title}</h1><p>{heading.description}</p></header>

      <div ref={messageRef}>{error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}</div>
      {loading && <p role="status">در حال بارگذاری…</p>}
      {(["find-game", "play", "create-game"] as Mode[]).includes(mode) && signedIn === false && <section className={styles.panel}><h2>برای بازی، اول وارد حساب شو</h2><p>ساخت میز و پیوستن به بازی با حساب فعال سایت انجام می‌شود.</p><div className={styles.actions}><Link href={`/register?next=${encodeURIComponent(returnTo || (mode === "create-game" ? routes.create : mode === "play" ? routes.play : routes.find))}`}>ساخت حساب</Link><Link href={`/login?next=${encodeURIComponent(returnTo || (mode === "create-game" ? routes.create : mode === "play" ? routes.play : routes.find))}`}>حساب دارم؛ ورود</Link></div></section>}

      {(mode === "play" || mode === "find-game") && <section id="join" className={`${styles.panel} ${styles.invitePanel}`} aria-labelledby="join-heading">
        <h2 id="join-heading">کد دعوت داری؟</h2><p>کد دعوت سایت یا کد شش‌حرفی داخل بازی را وارد کن و به میز DM بپیوند.</p>
        {signedIn ? <form onSubmit={event => { event.preventDefault(); void joinWithCode(); }}><label>کد دعوت<input required value={codeInput} onChange={event => setCodeInput(event.target.value.toUpperCase())} autoComplete="off" dir="ltr" /></label><button disabled={busy}>ورود با کد دعوت</button></form> : signedIn === false ? <div className={styles.actions}><Link href={`/login?next=${encodeURIComponent(`${routes.find}#join`)}`}>ورود به حساب و استفاده از کد</Link></div> : <p role="status">در حال بررسی حساب…</p>}
      </section>}

      {mode === "find-game" && !loading && <>

        <div className={styles.listToolbar}><input className={styles.search} aria-label="جستجوی میز" placeholder="نام یا ID دی‌ام، موضوع کمپین یا ژانر" value={filter} onChange={event => { setFilter(event.target.value); setGamePage(1); }} /><label>چینش <select value={gameSort} onChange={event => { setGameSort(event.target.value as "newest" | "likes"); setGamePage(1); }}><option value="newest">تازه‌ترین</option><option value="likes">بیشترین پسند</option></select></label><label>ژانر <select value={genre} onChange={e => { setGenre(e.target.value); setGamePage(1); }}><option value="">همهٔ ژانرها</option>{genreChoices.map(value => <option key={value}>{value}</option>)}</select></label><span>{visibleGames.length} کمپین</span></div>
        <div className={styles.gameGrid}>{visibleGames.slice((gamePage - 1) * gamesPerPage, gamePage * gamesPerPage).map(table => <article className={styles.gameCard} key={table.id}>
          <CoverImage src={table.imageData} title={table.title} /><div className={styles.gameCardBody}>
          <small>{table.system} · {table.language} · سطح {table.levelRange}</small><h2><Link href={`/find-game/${table.id}`}>{table.title}</Link></h2><div className={styles.genreTags}>{table.genres?.map(value => <span key={value}>{value}</span>)}</div><p>{table.description || "DM هنوز توضیحی برای این میز ننوشته است."}</p>
          <div className={styles.gameCardFooter}><Link href={`/dm/${table.hostUserId}`}>DM: {table.hostName || table.hostUsername || "میزبان"}</Link><span>{table.schedule}</span></div>
          <Reactions target={`tables/${table.id}`} summary={table} /><RecentReviews reviews={table.recentReviews} />
          <Link className={styles.detailLink} href={`/find-game/${table.id}`}>دیدن جزئیات کمپین ←</Link></div>
        </article>)}</div>
        {visibleGames.length > gamesPerPage && <nav className={styles.pagination} aria-label="صفحه‌های کمپین"><button disabled={gamePage === 1} onClick={() => setGamePage(page => page - 1)}>صفحهٔ پیشین</button><span>صفحهٔ {gamePage} از {Math.ceil(visibleGames.length / gamesPerPage)}</span><button disabled={gamePage * gamesPerPage >= visibleGames.length} onClick={() => setGamePage(page => page + 1)}>صفحهٔ بعدی</button></nav>}
        <section className={styles.panel}><h2>Dungeon Masterها</h2><p>با نام یا شناسه جستجو کن و معرفی، کمپین‌ها و نظر بازیکنان را ببین.</p><div className={styles.dmGrid}>{profiles.map(profile => <DmCard key={profile.userId} profile={profile} />)}</div><Link href="/find-dm">همهٔ DMها ←</Link></section>
        {!tables.length && <div className={styles.empty}>هنوز میز منتشرشده‌ای وجود ندارد. اگر DM هستی، نخستین میز را بساز. <Link href={routes.create}>ساخت میز</Link></div>}
      </>}

      {mode === "find-dm" && !loading && <>
        <input className={styles.search} aria-label="جستجوی DM" placeholder="نام یا ID دی‌ام" value={filter} onChange={e => setFilter(e.target.value)}/>
        <div className={styles.dmGrid}>{profiles.map(profile => <DmCard key={profile.userId} profile={profile} />)}</div>
        {!profiles.length && <div className={styles.empty}>هنوز پروفایل DM منتشر نشده است.</div>}
        <section className={styles.panel}><h2>صفحهٔ DM خودت</h2><p>از حساب من صفحه‌ات را فعال کن، تصویر و معرفی بگذار و میزهایت را نشان بده.</p><Link href="/account/dm">ساخت یا ویرایش صفحهٔ DM ←</Link></section>
      </>}

      {(mode === "play" || mode === "create-game") && !loading && <>
        {!mine && signedIn && <div className={styles.empty}>میزهای تو بارگذاری نشدند. صفحه را تازه‌سازی کن.</div>}
        {mine && <>{mode === "create-game" && <section className={styles.panel}><h2>{editTableId ? "ویرایش میز" : "میز تازه"}</h2><form onSubmit={event => { event.preventDefault(); void saveTable(); }}>
          <label>عنوان میز<input required minLength={3} value={tableForm.title} onChange={e => setTableForm({ ...tableForm, title: e.target.value })} /></label>
          <details className={styles.expandField} open={editTableId ? true : undefined}><summary>درباره کمپین <span>توضیحات کامل را اینجا بنویس</span></summary><label>توضیحات کمپین<textarea maxLength={2000} value={tableForm.description} onChange={e => setTableForm({ ...tableForm, description: e.target.value })} /></label></details>
          <fieldset className={styles.genreTags}><legend>ژانر کمپین · حداکثر ۴ تگ</legend>{genreChoices.map(value => <label key={value}><input type="checkbox" checked={tableForm.genres.includes(value)} disabled={!tableForm.genres.includes(value) && tableForm.genres.length >= 4} onChange={e => setTableForm({ ...tableForm, genres: e.target.checked ? [...tableForm.genres, value] : tableForm.genres.filter(item => item !== value) })}/>{value}</label>)}</fieldset>
          <label>کاور کمپین · پیش‌نمایش ۱۲۸۰×۸۰۰، تا ۵۰۰ کیلوبایت<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async e => { const file = e.target.files?.[0]; if (!file) return; setBusy(true); setError(""); try { const value = await prepareProfileImage(file, "campaign"); setTableForm(current => ({ ...current, imageData: value })); } catch (reason) { setError(reason instanceof Error ? reason.message : "تصویر آماده نشد."); } finally { setBusy(false); } }}/>{tableForm.imageData && <img className={styles.campaignImage} src={tableForm.imageData} alt="پیش‌نمایش کمپین"/>}</label>{tableForm.imageData && <button type="button" onClick={() => setTableForm({ ...tableForm, imageData: null })}>حذف تصویر کمپین</button>}
          <label>سیستم بازی<input required value={tableForm.system} onChange={e => setTableForm({ ...tableForm, system: e.target.value })} /></label>
          <label>زبان<input required value={tableForm.language} onChange={e => setTableForm({ ...tableForm, language: e.target.value })} /></label>
          <label>سبک<input required value={tableForm.playStyle} onChange={e => setTableForm({ ...tableForm, playStyle: e.target.value })} /></label>
          <label>بازه سطح<input required value={tableForm.levelRange} onChange={e => setTableForm({ ...tableForm, levelRange: e.target.value })} /></label>
          <label>زمان‌بندی<input required value={tableForm.schedule} onChange={e => setTableForm({ ...tableForm, schedule: e.target.value })} /></label>
          <label>ظرفیت<input type="number" lang="en" dir="ltr" min="2" max="8" value={tableForm.capacity} onChange={e => setTableForm({ ...tableForm, capacity: Number(e.target.value) })} /></label>
          <label>نوع نمایش<select value={tableForm.visibility} onChange={e => setTableForm({ ...tableForm, visibility: e.target.value as "PUBLIC" | "PRIVATE" })}><option value="PUBLIC">عمومی؛ در فهرست بازی‌ها</option><option value="PRIVATE">خصوصی؛ فقط با کد دعوت</option></select></label>
          <label>وضعیت<select value={tableForm.status} onChange={e => setTableForm({ ...tableForm, status: e.target.value })}><option value="DRAFT">پیش‌نویس</option><option value="PUBLISHED">منتشرشده</option><option value="CLOSED">بسته</option></select></label>
          <button disabled={busy}>{editTableId ? "ذخیره تغییرات" : "ساخت میز"}</button>{editTableId && <button type="button" onClick={() => setEditTableId(null)}>لغو ویرایش</button>}
        </form>{inviteCode && <p className={styles.notice}>کد دعوت خصوصی: <strong dir="ltr">{inviteCode}</strong> — آن را برای دوستانت بفرست. این کد پس از بستن صفحه دوباره نمایش داده نمی‌شود.</p>}<p><Link href={routes.play}>بازگشت به میزهای من ←</Link></p></section>}
        {mode === "play" && <>
        <h2>میزهایی که DM آن‌ها هستم</h2><div className={styles.hostedGrid}>{mine.hosted.map(table => <article className={`${styles.card} ${styles.hostedCard}`} key={table.id}><fieldset className={styles.ownerControls} disabled={busy || table.deletionPending}><span className={styles.roleBadge}>نقش من: DM · میزبان</span><small>{tableStatusNames[table.status ?? ""] ?? table.status} · {table.visibility === "PRIVATE" ? "خصوصی" : "عمومی"}</small><h3>{table.title}</h3><p>{table.description}</p><SessionSummary status={table.sessionStatus} /><div className={styles.actions}><Link href={`${routes.create}?edit=${encodeURIComponent(table.id)}`} aria-label={`مدیریت میز ${table.title}`}>مدیریت میز</Link><button disabled={busy} onClick={() => void launch(table.id, "dm")}>ورود به بازی با نقش DM</button><details className={styles.tableOptions}><summary>گزینه‌های میز</summary><div className={styles.actions}><button disabled={busy || table.status === "HIDDEN"} onClick={() => void act(() => request(`tables/${table.id}`, "PUT", { title: table.title, description: table.description, genres: table.genres ?? [], imageData: table.imageData ?? null, system: table.system, language: table.language, playStyle: table.playStyle, levelRange: table.levelRange, schedule: table.schedule, capacity: table.capacity, visibility: table.visibility, status: table.status === "PUBLISHED" ? "CLOSED" : "PUBLISHED" }), "وضعیت میز تغییر کرد.")}>{table.status === "PUBLISHED" ? "بستن میز" : "انتشار میز"}</button>{table.visibility === "PRIVATE" && <button disabled={busy} onClick={() => void act(async () => { const result = await request<{inviteCode: string}>(`tables/${table.id}/invite/rotate`, "POST"); setInviteCode(result.inviteCode); }, "کد دعوت تازه ساخته شد؛ کد قبلی دیگر کار نمی‌کند.")}>ساخت کد دعوت تازه</button>}<button disabled={busy} onClick={() => { setSelected(table.id); void request<Application[]>(`tables/${table.id}/applications`).then(setApplications).catch(e => setError(e.message)); }}>اعضا</button></div></details></div></fieldset><DeleteCampaign id={table.id} title={table.title} pending={table.deletionPending} onDeleted={() => { void refresh(); }} /></article>)}</div>
        {selected && <section className={styles.panel}><h2>درخواست‌های میز</h2>{applications.map(application => <div key={application.id} className={styles.application}><strong>{application.email}</strong><span>{application.note || "بدون پیام"}</span><small>{application.status}</small>{application.status === "PENDING" && <div className={styles.actions}><button disabled={busy} onClick={() => void act(() => request(`applications/${application.id}/respond`, "POST", { accept: true }), "درخواست پذیرفته شد.")}>پذیرش</button><button disabled={busy} onClick={() => void act(() => request(`applications/${application.id}/respond`, "POST", { accept: false }), "درخواست رد شد.")}>رد</button></div>}</div>)}{!applications.length && <p>درخواستی ثبت نشده است.</p>}</section>}
        {!mine.hosted.length && <p className={styles.empty}>هنوز میزی نساخته‌ای. <Link href={routes.create}>اولین میزت را بساز ←</Link></p>}
        <h2>میزها و درخواست‌های من به‌عنوان پلیر</h2><div className={styles.grid}>{mine.applications.map(application => <article className={styles.card} key={application.id}><span className={styles.roleBadge}>{application.status === "ACCEPTED" ? "نقش من: پلیر · بازیکن" : "درخواست پیوستن به میز"}</span><h3>{application.title}</h3><p>{applicationStatusNames[application.status] ?? application.status} · {tableStatusNames[application.tableStatus ?? ""] ?? application.tableStatus}</p><SessionSummary status={application.sessionStatus} />{application.status === "ACCEPTED" && application.tableStatus === "PUBLISHED" && <button disabled={busy} onClick={() => void launch(application.tableId, "player")}>ورود به بازی</button>}{["PENDING", "ACCEPTED"].includes(application.status) && <button disabled={busy} onClick={() => void act(() => request(`applications/${application.id}/withdraw`, "POST"), "درخواست پس گرفته شد.")}>{application.status === "ACCEPTED" ? "ترک میز" : "لغو درخواست"}</button>}</article>)}</div>
        {!mine.applications.length && <p className={styles.empty}>هنوز به میزی نپیوسته‌ای. <Link href={routes.find}>پیدا کردن بازی ←</Link> یا از کد دعوت بالا استفاده کن.</p>}
        </>}
        </>}
      </>}

      {mode === "arena" && !loading && <>
        <section className={styles.panel}><h2>دعوت تازه</h2><form className={styles.arenaForm} onSubmit={event => { event.preventDefault(); void act(() => request("arena", "POST", arenaForm), "دعوت آرنا ثبت شد."); }}><label>عنوان<input required minLength={3} value={arenaForm.title} onChange={e => setArenaForm({ ...arenaForm, title: e.target.value })} /></label><label>حالت<select value={arenaForm.mode} onChange={e => setArenaForm({ ...arenaForm, mode: e.target.value })}><option value="1V1">1v1</option><option value="2V2">2v2</option><option value="3V3">3v3</option></select></label><label className={styles.fullRow}>توضیحات<textarea maxLength={500} value={arenaForm.note} onChange={e => setArenaForm({ ...arenaForm, note: e.target.value })} /></label><div className={styles.formActions}><button disabled={busy}>ثبت دعوت</button></div></form></section>
        <h2>دعوت‌های باز</h2><div className={styles.grid}>{listings.map(listing => <article className={styles.card} key={listing.id}><small>{listing.mode}{arenaFill(listing)}</small><h3>{listing.title}</h3><p>{listing.note || "بدون توضیح"}</p><button disabled={busy} onClick={() => void act(() => request(`arena/${listing.id}/join`, "POST"), "به دعوت پیوستی. اجرای بازی پس از اتصال WebVTT فعال می‌شود.")}>پیوستن</button></article>)}</div>
        {!listings.length && <div className={styles.empty}>هنوز دعوت بازی وجود ندارد.</div>}
        {!!myListings.length && <><h2>دعوت‌های من</h2><div className={styles.grid}>{myListings.map(listing => <article className={styles.card} key={listing.id}><h3>{listing.title}</h3><p>{listing.mode} · {listing.status}{arenaFill(listing)}</p>{listing.status === "OPEN" && <button disabled={busy} onClick={() => void act(() => request(`arena/${listing.id}/cancel`, "POST"), "دعوت لغو شد.")}>لغو دعوت</button>}</article>)}</div></>}
      </>}
    </div>
  </main>;
}
