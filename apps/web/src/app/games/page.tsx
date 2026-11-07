import Link from "next/link";
import styles from "@/components/destination-hub.module.css";
export const metadata = { title: "میز بازی" };
const items = [
  ["/play", "میزهای من", "میزهایی که DM یا بازیکن آن‌ها هستی؛ مدیریت میز و ورود به سشن."],
  ["/find-game", "پیدا کردن بازی", "جستجوی میزهای بازی با نام، شناسه، موضوع یا ژانر."],
  ["/find-dm", "پیدا کردن DM", "بازی‌گردان مناسب گروهت را پیدا کن؛ معرفی، سبک اجرا، میزها و نظر بازیکنان را ببین."],
  ["/create-game", "ساخت میز", "کمپین خودت را بساز، معرفی کن و بازیکن بپذیر."],
] as const;
export default function Page() {
  return <main className={styles.page}><div className="shell"><header className={styles.intro}><h1>میز بازی</h1><p>میزت را انتخاب کن یا ماجرای بعدی را پیدا کن.</p></header><nav className={styles.grid} aria-label="بخش‌های بازی">{items.map(([href,title,text]) => <Link className={styles.card} href={href} key={href}><h2>{title}</h2><p>{text}</p><span aria-hidden="true">←</span></Link>)}</nav></div></main>;
}
