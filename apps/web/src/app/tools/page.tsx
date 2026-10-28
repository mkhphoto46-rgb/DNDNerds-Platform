import Link from "next/link";
import styles from "@/components/destination-hub.module.css";
export const metadata = { title: "ابزارها" };
const items = [["/cartography", "نقشه‌خانه", "نقشه‌ها و ابزارهای ساخت جهان؛ این بخش در حال آماده‌سازی است."], ["/blacksmith", "آهنگری", "ابزارهای آماده‌سازی ماجراجویی؛ این بخش در حال آماده‌سازی است."], ["/learn", "آموزش", "راهنماهای بازی و شروع ماجراجویی."], ["/news", "تازه‌ها", "خبرها و تازه‌های DND Nerds."]] as const;
export default function Page() {
 return <main className={styles.page}><div className="shell"><header className={styles.intro}><h1>ابزارها</h1><p>برای آماده‌سازی و شناخت دنیای بازی.</p></header><nav className={styles.grid} aria-label="ابزارها و راهنماها">{items.map(([href,title,text]) => <Link className={styles.card} href={href} key={href}><h2>{title}</h2><p>{text}</p><span aria-hidden="true">←</span></Link>)}</nav></div></main>;
}
