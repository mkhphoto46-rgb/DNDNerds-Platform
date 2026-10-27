import type { Metadata } from "next";
import Link from "next/link";
import { apiFetch } from "@/lib/bff-api";
import styles from "./pricing.module.css";

export const metadata: Metadata = {
  title: "اشتراک بازی | DND NERDS",
  description: "جزئیات اشتراک ۳۰ روزه بازی آنلاین DND NERDS",
};

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  let priceToman: number | null = null;
  try {
    const response = await apiFetch("/api/v1/subscriptions/plan");
    if (response.ok) {
      const body = await response.json() as { data?: { priceRial?: number } };
      if (typeof body.data?.priceRial === "number") priceToman = body.data.priceRial / 10;
    }
  } catch { /* The price is hidden if the API cannot be reached. */ }
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <span className={styles.eyebrow}>DND NERDS · عضویت بازی</span>
          <h1>ماجراجویی خودت را ادامه بده</h1>
          <p>اشتراک هر بازیکن جداگانه است. قیمت و شرایط دوره را اینجا ببین؛ خرید اینترنتی پس از راه‌اندازی درگاه فعال می‌شود.</p>
        </header>

        <section className={styles.plan} aria-labelledby="game-plan">
          <div className={styles.topline}><span>اشتراک بازی آنلاین</span><span className={styles.badge}>دورهٔ ۳۰ روزه</span></div>
          <h2 id="game-plan">دسترسی کامل به بازی</h2>
          <p className={styles.price}><strong>{priceToman === null ? "قیمت در دسترس نیست" : new Intl.NumberFormat("fa-IR").format(priceToman)}</strong><span>{priceToman === null ? "" : "تومان / ۳۰ روز"}</span></p>
          <ul>
            <li>حضور در میزهای بازی و استفاده از محیط بازی آنلاین</li>
            <li>ساخت و مدیریت میز برای راهبر بازی</li>
            <li>گفت‌وگو و ارتباط صوتی در میز، طبق امکانات هر میز</li>
          </ul>
          <div className={styles.availability} role="status">درگاه پرداخت هنوز راه‌اندازی نشده است؛ خرید آنلاین فعلاً در دسترس نیست.</div>
          <Link className={styles.action} href="/register">ساخت حساب</Link>
          <p className={styles.footnote}>تمدید با پرداخت دستی انجام می‌شود. کسر خودکار ماهانه نداریم. دسترسی حساب‌های فعلی تا تصمیم جداگانهٔ مدیر تغییر نمی‌کند.</p>
        </section>

        <section className={styles.faq} aria-label="پرسش‌های اشتراک">
          <article><h3>آیا هر نفر اشتراک خودش را می‌خواهد؟</h3><p>بله؛ بازیکن و راهبر بازی هر کدام اشتراک جداگانه دارند.</p></article>
          <article><h3>تمدید چگونه است؟</h3><p>هر دوره ۳۰ روز است و تمدید با پرداخت آگاهانهٔ خودت انجام می‌شود.</p></article>
          <article><h3>چه زمانی می‌توانم بخرم؟</h3><p>پس از فعال شدن درگاه پرداخت، دکمهٔ خرید در همین صفحه قرار می‌گیرد. تا آن زمان دسترسی فعلی بازی تغییر نمی‌کند.</p></article>
        </section>
      </div>
    </main>
  );
}
