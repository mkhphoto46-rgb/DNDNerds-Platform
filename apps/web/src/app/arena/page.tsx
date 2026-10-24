import type { Metadata } from "next";
import Link from "next/link";
import "../coming-soon.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "آرنا" };
export default function Page() {
  return <main className="coming-soon-page"><section className="coming-soon-card"><span>آرنا</span><h1>Coming Soon</h1><Link href="/">بازگشت به شهر</Link></section></main>;
}
