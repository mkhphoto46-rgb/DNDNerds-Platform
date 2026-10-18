import Link from "next/link";

export default function NotFound() {
  return (
    <main className="placeholder-page">
      <section className="shell placeholder-content">
        <div className="section-kicker">خطای ۴۰۴</div>
        <h1>این مسیر پیدا نشد</h1>
        <p>صفحه‌ای که دنبال آن هستی وجود ندارد یا جابه‌جا شده است</p>

        <div className="hero-actions">
          <Link className="button button-primary" href="/">
            بازگشت به خانه
          </Link>
        </div>
      </section>
    </main>
  );
}