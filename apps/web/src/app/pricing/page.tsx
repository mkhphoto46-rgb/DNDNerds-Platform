import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/game-hub.module.css";
export const metadata: Metadata = { title: "اشتراک" };
export const dynamic = "force-dynamic";
export default function Page() { return <main className={styles.page}><div className="shell"><header className={styles.intro}><span className="section-kicker">اشتراک</span><h1>وضعیت دسترسی و اشتراک</h1><p>پیدا کردن میز، ساخت پروفایل DM و مدیریت کمپین در نسخه فعلی سایت در دسترس‌اند. برنامه اشتراک پولی و قیمت آن هنوز اعلام نشده است.</p></header><div className={styles.grid}><article className={styles.card}><small>در دسترس</small><h2>حساب و جامعه</h2><p>پروفایل، میزها، درخواست‌های عضویت، گفتگو و بازارچه.</p><Link href="/register">ساخت حساب ←</Link></article><article className={styles.card}><small>بازی آنلاین</small><h2>WebVTT</h2><p>از Tavern میز عمومی یا خصوصی پیدا کن یا به عنوان DM بازی بساز.</p><Link href="/tavern">ورود به Tavern ←</Link></article></div></div></main>; }
