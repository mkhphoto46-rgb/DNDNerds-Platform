import type { Metadata } from "next";
import Link from "next/link";
import "../coming-soon.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "آهنگری" };
export default function BlacksmithPage() {
  return <main className="coming-soon-page"><section className="coming-soon-card"><span>آهنگری</span><h1>Coming Soon</h1><Link href="/">بازگشت به شهر</Link></section></main>;
}
