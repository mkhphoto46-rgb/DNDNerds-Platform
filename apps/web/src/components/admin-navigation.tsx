"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./admin-navigation.module.css";

export const adminGroups = [
  { slug: "games", title: "بازی و میزها", description: "ویرایش و حذف میزهای بازی، مدیریت DMها و آرنا", links: [
    ["میزهای بازی؛ ویرایش و حذف", "/admin/control?kind=tables"],
    ["DMها، آرنا و خبرهای بازی", "/admin/game-hub"],
  ] },
  { slug: "commerce", title: "بازارچه و فروش", description: "فروشگاه‌ها، محصولات، فروشندگان و حسابداری", links: [
    ["فروشگاه‌ها", "/admin/control?kind=stores"], ["محصولات و موجودی", "/admin/control?kind=products"],
    ["فروشندگان و بررسی محتوا", "/admin/marketplace"], ["گزارش فروش", "/admin/sales"],
    ["تسویه‌ها", "/admin/payouts"], ["تنظیمات و کارمزد بازارچه", "/admin/marketplace/settings"],
  ] },
  { slug: "people", title: "حساب‌ها و دسترسی‌ها", description: "مدیریت کاربران، نقش‌ها، تأیید حساب و اشتراک‌ها", links: [
    ["حساب‌های کاربران", "/admin/accounts"], ["اشتراک و دسترسی بازی", "/admin/subscriptions"],
  ] },
  { slug: "site", title: "مدیریت سایت", description: "بازخورد کاربران و وضعیت سرویس‌های سایت", links: [
    ["نظرها و پیشنهادها", "/admin/feedback"], ["وضعیت سایت و سرور", "/admin/system"],
  ] },
] as const;

export function AdminCategory({ slug }: { slug?: string }) {
  const group = adminGroups.find(g => g.slug === slug);
  return <main className={styles.page}><div className="shell">
    <header className={styles.header}><span> DND NERDS · ADMIN </span><h1>{group?.title ?? "مدیریت سایت"}</h1><p>{group?.description ?? "بخش موردنظر را انتخاب کن؛ ابزارهای مرتبط در یک مسیر کنار هم قرار دارند."}</p></header>
    <div className={styles.grid}>{group ? group.links.map(([title, href]) => <Link className={styles.card} key={href} href={href}><h2>{title}</h2><span>ورود به مدیریت ←</span></Link>) : adminGroups.map(g => <Link className={styles.card} key={g.slug} href={`/admin/${g.slug}`}><h2>{g.title}</h2><p>{g.description}</p><span>مشاهدهٔ ابزارها ←</span></Link>)}</div>
  </div></main>;
}

export function AdminNavigation() {
  const pathname = usePathname(), search = useSearchParams();
  const kind = search.get("kind") ?? "tables";
  const active = pathname === "/admin/control" ? (kind === "tables" ? "games" : "commerce")
    : adminGroups.find(g => pathname === `/admin/${g.slug}` || g.links.some(([,href]) => pathname === href.split("?")[0]))?.slug;
  return <nav className={styles.navigation} aria-label="دسته‌بندی‌های مدیریت">
    <Link href="/admin">همهٔ بخش‌ها</Link>{adminGroups.map(g => <Link key={g.slug} href={`/admin/${g.slug}`} aria-current={active === g.slug ? "page" : undefined}>{g.title}</Link>)}
  </nav>;
}
