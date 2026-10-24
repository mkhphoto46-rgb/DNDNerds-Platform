"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "./accounts.module.css";



type Status = "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED" | "BANNED";
type Role = "SUPER_ADMIN" | "MARKETPLACE_ADMIN" | "SUPPORT" | "NONE";
type Account = { id: string; publicId: string; username: string | null; email: string; status: Status; emailVerified: boolean; createdAt: string; updatedAt: string; adminRole: Role | null; adminActive: boolean; lastSeenAt?: string | null; activeSessions?: number };
type PageData = { data: Account[]; total: number; page: number; pageSize: number; statusCounts: Partial<Record<Status, number>>; admin: { role: Role; email: string; userId: string } };
const statusNames: Record<Status, string> = { PENDING_APPROVAL: "در انتظار تأیید", ACTIVE: "فعال", SUSPENDED: "تعلیق‌شده", BANNED: "مسدود" };
const roleNames: Record<Role, string> = { SUPER_ADMIN: "مدیر اصلی", MARKETPLACE_ADMIN: "مدیر فروشگاه", SUPPORT: "پشتیبانی", NONE: "کاربر عادی" };
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(value)) : "ثبت نشده";

async function read<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message ?? "درخواست انجام نشد.");
  return body as T;
}

export default function AccountsAdminPage() {
  const [data, setData] = useState<PageData | null>(null);
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [status, setStatus] = useState<Status | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Account | null>(null);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), status });
    if (submittedSearch) query.set("q", submittedSearch);
    const result = await read<PageData>(`/api/admin/accounts?${query}`);
    setData(result);
  }, [page, status, submittedSearch]);

  useEffect(() => { void load().catch(reason => setError(reason instanceof Error ? reason.message : "بارگذاری کاربران انجام نشد.")); }, [load]);

  async function open(account: Account) {
    setError(""); setNotice("");
    try { setSelected((await read<{ data: Account }>(`/api/admin/accounts/${account.id}`)).data); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "جزئیات حساب باز نشد."); }
  }

  async function change(path: "status" | "role", value: Status | Role) {
    if (!selected || !password || reason.trim().length < 3) { setError("رمز مدیر و دلیل تغییر (حداقل ۳ نویسه) را وارد کن."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await read(`/api/admin/accounts/${selected.id}/${path}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [path]: value, password, reason }) });
      setPassword(""); setReason("");
      setNotice("تغییر ذخیره شد و در تاریخچه مدیریت ثبت شد.");
      await load();
      setSelected((await read<{ data: Account }>(`/api/admin/accounts/${selected.id}`)).data);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "تغییر انجام نشد."); }
    finally { setBusy(false); }
  }

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.header}><Link href="/admin">← داشبورد مدیریت</Link><small>DND NERDS · ADMIN</small><h1>مدیریت حساب‌های سایت</h1><p>تاریخ ساخت، وضعیت حساب و سطح دسترسی هر کاربر را اینجا ببین و مدیریت کن.</p></header>
    {error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}
    {!data ? <p className={styles.card}>در حال بارگذاری حساب‌ها…</p> : <>
      <div className={styles.stats}><div className={styles.stat}><strong>{data.total}</strong><span>نتایج جستجو</span></div>{(["PENDING_APPROVAL", "ACTIVE", "SUSPENDED", "BANNED"] as Status[]).map(item => <button type="button" className={styles.stat} key={item} onClick={() => { setStatus(item); setPage(1); }}><strong>{data.statusCounts[item] ?? 0}</strong><span>{statusNames[item]}</span></button>)}</div>
      <section className={styles.card}><h2>پیدا کردن کاربر</h2><form className={styles.filters} onSubmit={event => { event.preventDefault(); setSubmittedSearch(search.trim()); setPage(1); }}><label>ایمیل<input type="search" placeholder="ایمیل کاربر را بنویس" value={search} onChange={event => setSearch(event.target.value)} /></label><label>وضعیت<select value={status} onChange={event => { setStatus(event.target.value as Status | "ALL"); setPage(1); }}><option value="ALL">تمام وضعیت‌ها</option>{(Object.keys(statusNames) as Status[]).map(item => <option key={item} value={item}>{statusNames[item]}</option>)}</select></label><button type="submit">جستجو</button></form></section>
      <section className={styles.card}><h2>حساب‌ها</h2><div className={styles.tableWrap}><table><thead><tr><th>کاربر</th><th>تاریخ ثبت‌نام</th><th>وضعیت</th><th>دسترسی</th><th></th></tr></thead><tbody>{data.data.map(account => <tr key={account.id}><td><strong dir="ltr">{account.email}</strong><small>{account.emailVerified ? "ایمیل تأیید شده" : "ایمیل تأیید نشده"}</small></td><td>{date(account.createdAt)}</td><td>{statusNames[account.status]}</td><td>{account.adminActive && account.adminRole ? roleNames[account.adminRole] : "کاربر عادی"}</td><td><button type="button" onClick={() => void open(account)}>جزئیات و مدیریت</button></td></tr>)}</tbody></table></div>{!data.data.length && <p>حسابی با این مشخصات پیدا نشد.</p>}<div className={styles.pager}><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>صفحه پیشین</button><span>صفحه {page} از {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button type="button" disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>صفحه بعدی</button></div></section>
    </>}
    {selected && data && <div className={styles.overlay} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}><section className={styles.detail} role="dialog" aria-modal="true" aria-label="جزئیات حساب"><button type="button" className={styles.close} onClick={() => setSelected(null)}>بستن ×</button><h2 dir="ltr">{selected.email}</h2>{error && <p className={styles.error} role="alert">{error}</p>}{notice && <p className={styles.notice} role="status">{notice}</p>}<dl><div><dt>تاریخ ساخت حساب</dt><dd>{date(selected.createdAt)}</dd></div><div><dt>آخرین فعالیت در سایت</dt><dd>{date(selected.lastSeenAt)}</dd></div><div><dt>نشست‌های فعال سایت</dt><dd>{selected.activeSessions ?? 0}</dd></div><div><dt>وضعیت</dt><dd>{statusNames[selected.status]}</dd></div><div><dt>نام کاربری</dt><dd dir="ltr">{selected.username ?? "هنوز تعیین نشده"}</dd></div><div><dt>تأیید ایمیل</dt><dd>{selected.emailVerified ? "بله" : "خیر"}</dd></div><div><dt>دسترسی مدیریتی</dt><dd>{selected.adminActive && selected.adminRole ? roleNames[selected.adminRole] : "کاربر عادی"}</dd></div><div><dt>شناسه حساب</dt><dd dir="ltr">{selected.publicId}</dd></div></dl>
      {data.admin.role !== "SUPPORT" && selected.id !== data.admin.userId && <><h3>تغییر دسترسی و وضعیت</h3><p>برای هر تغییر، دلیل کوتاه و رمز حساب مدیر لازم است. تعلیق و مسدودسازی، نشست‌های فعال سایت را باطل می‌کند.</p><label>دلیل تغییر<input value={reason} onChange={event => setReason(event.target.value)} placeholder="مثلاً درخواست خود کاربر" maxLength={500} /></label><label>رمز حساب مدیر<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label><div className={styles.actions}><button disabled={busy || !password || reason.trim().length < 3 || selected.status === "ACTIVE"} onClick={() => void change("status", "ACTIVE")}>فعال‌سازی / تأیید</button><button disabled={busy || !password || reason.trim().length < 3 || selected.status === "SUSPENDED"} onClick={() => void change("status", "SUSPENDED")}>تعلیق حساب</button><button disabled={busy || !password || reason.trim().length < 3 || selected.status === "BANNED"} onClick={() => void change("status", "BANNED")}>مسدودسازی</button></div>{data.admin.role === "SUPER_ADMIN" && <div className={styles.roles}><h3>نقش مدیریتی</h3><p>نقش مدیر اصلی به تمام بخش‌های مدیریتی دسترسی می‌دهد. پشتیبانی فقط امکان مشاهده دارد.</p>{(Object.keys(roleNames) as Role[]).map(role => <button key={role} disabled={busy || !password || reason.trim().length < 3 || (role !== "NONE" && selected.status !== "ACTIVE") || (selected.adminActive ? selected.adminRole === role : role === "NONE")} onClick={() => void change("role", role)}>{roleNames[role]}</button>)}</div>}</>}
      {selected.id === data.admin.userId && <p>برای جلوگیری از قطع دسترسی، وضعیت و نقش حساب خودت از این صفحه تغییر نمی‌کند.</p>}
    </section></div>}
  </div></main>;
}
