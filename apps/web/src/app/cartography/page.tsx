import type { Metadata } from "next";
import Link from "next/link";
import "../coming-soon.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "نقشه‌خانه" };
export default function CartographyPage() {
  return <main className="coming-soon-page"><section className="coming-soon-card"><span>نقشه‌خانه</span><h1>Coming Soon</h1><Link href="/">بازگشت به شهر</Link></section></main>;
}
