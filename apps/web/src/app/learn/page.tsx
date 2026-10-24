import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/game-hub.module.css";
export const metadata: Metadata = { title: "راهنمای سایت" };
const guides = [
  { title: "چطور عضو یک کمپین شوم؟", steps: ["با حساب سایت وارد شو.", "در Tavern نقش Player را انتخاب کن و میزهای عمومی را ببین، یا کد دعوت میز خصوصی را وارد کن.", "روی ورود به بازی بزن تا محیط Player باز شود."], href: "/find-game", action: "دیدن میزها" },
  { title: "چطور به‌عنوان DM میز بسازم؟", steps: ["در Tavern نقش DM را انتخاب کن.", "عنوان، زمان، ظرفیت و عمومی یا خصوصی بودن میز را مشخص کن.", "میز را منتشر کن؛ اگر خصوصی است، کد دعوت را برای دوستانت بفرست و با نمای DM وارد شو."], href: "/play", action: "مدیریت میزها" },
  { title: "آرنا چگونه کار می‌کند؟", steps: ["یک دعوت 1v1، 2v2 یا 3v3 ثبت کن.", "بازیکن دیگری می‌تواند به دعوت بپیوندد.", "اجرای نبرد پس از اتصال WebVTT به سایت فعال خواهد شد."], href: "/arena", action: "دیدن آرنا" },
  { title: "بازارچه و سفارش‌ها", steps: ["محصولات فروشگاه را بررسی و به سبد اضافه کن.", "از حساب کاربری، سفارش‌های خودت را پیگیری کن.", "اگر فروشنده هستی، پنل فروشنده برای مدیریت فروشگاه در دسترس است."], href: "/store", action: "رفتن به بازارچه" },
];
export default function Page() { return <main className={styles.page}><div className="shell"><header className={styles.intro}><span className="section-kicker">راهنما</span><h1>راهنمای استفاده از سایت</h1><p>مسیرهای اصلی سایت را مرحله به مرحله بشناس.</p></header><div className={styles.grid}>{guides.map(guide => <article className={styles.card} key={guide.title}><h2>{guide.title}</h2><ol>{guide.steps.map(step => <li key={step}>{step}</li>)}</ol><Link href={guide.href}>{guide.action} ←</Link></article>)}</div></div></main>; }
