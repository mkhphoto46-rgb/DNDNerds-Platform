import Link from "next/link";
import type { Metadata } from "next";
import styles from "@/components/game-hub.module.css";

export const metadata: Metadata = { title: "Tavern | بازی آنلاین" };
export const dynamic = "force-dynamic";

export default function TavernPage() {
  return <main className={styles.page}><div className="shell">
    <header className={styles.intro}><span className="section-kicker">Tavern DND Nerds</span><h1>سر میز بازی جایت را پیدا کن</h1><p>برای ورود، نقش خودت را انتخاب کن. DM بازی را می‌سازد و با نمای مدیریت وارد می‌شود؛ بازیکن میزهای عمومی را پیدا می‌کند یا با کد دعوت به میز خصوصی می‌پیوندد.</p></header>
    <div className={styles.grid}>
      <article className={styles.card}><small>PLAYER</small><h2>پیدا کردن بازی‌های جدید</h2><p>میزهای عمومی را ببین یا کد دعوت DM را وارد کن و در محیط بازی با نمای بازیکن وارد شو.</p><Link href="/find-game">من بازیکن هستم ←</Link></article>
      <article className={styles.card}><small>DUNGEON MASTER</small><h2>ساخت بازی</h2><p>کمپین بساز، عمومی یا خصوصی بودنش را انتخاب کن، کد دعوت بده و با نمای DM بازی را اجرا کن.</p><Link href="/play">من DM هستم ←</Link></article>
    </div>
  </div></main>;
}
