import Link from "next/link";
import styles from "@/components/destination-hub.module.css";
export const metadata = { title: "بازی‌ها" };
const items = [
  ["/play", "میزهای من", "میزهایی که DM یا بازیکن آن‌ها هستی؛ مدیریت میز و ورود به سشن."],
  ["/find-game", "پیدا کردن بازی و DM", "جستجوی کمپین و بازی‌گردان با نام، شناسه، موضوع یا ژانر."],
  ["/create-game", "ساخت میز", "کمپین خودت را بساز، معرفی کن و بازیکن بپذیر."],
  ["/find-game#join", "ورود با کد دعوت", "کدی را که DM فرستاده وارد کن و به میز خصوصی بپیوند."],
] as const;
export default function Page() {
  return <main className={styles.page}><div className="shell"><header className={styles.intro}><h1>بازی‌ها</h1><p>میزت را انتخاب کن یا ماجرای بعدی را پیدا کن.</p></header><nav className={styles.grid} aria-label="بخش‌های بازی">{items.map(([href,title,text]) => <Link className={styles.card} href={href} key={href}><h2>{title}</h2><p>{text}</p><span aria-hidden="true">←</span></Link>)}</nav><div className={styles.secondary}><Link href="/arena">آرنا و رقابت‌ها</Link></div></div></main>;
}
