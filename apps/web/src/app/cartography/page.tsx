import type { Metadata } from "next";
import Link from "next/link";
import "./cartography.css";

export const metadata: Metadata = {
  title: "کارگاه نقشه‌سازی",
  description: "کارگاه نقشه‌سازی DND Nerds؛ فضای آینده برای ساخت نقشه و افزودن آن به میز بازی.",
};

export default function CartographyPage() {
  return <main className="cartography-page">
    <section className="cartography-hero" aria-labelledby="cartography-title">
      <div className="cartography-copy">
        <span className="cartography-eyebrow">خانهٔ نقشه‌نگار · به‌زودی</span>
        <h1 id="cartography-title">دنیای خودت را رسم کن.</h1>
        <p>اینجا نقشهٔ ماجراجویی‌ات را می‌سازی و به میز بازی می‌بری.</p>
        <div className="cartography-actions">
          <Link href="/play" className="cartography-primary">دیدن میز بازی <span aria-hidden="true">←</span></Link>
          <Link href="/" className="cartography-secondary">بازگشت به شهر</Link>
        </div>
      </div>
      <div className="cartography-desk" aria-label="تصویری از نقشهٔ فانتزی روی میز نقشه‌نگار" role="img">
        <div className="cartography-map">
          <span className="cartography-compass">✧<small>شمال</small></span>
          <span className="cartography-river" />
          <span className="cartography-forest forest-one">♠ ♠ ♠</span>
          <span className="cartography-forest forest-two">♠ ♠</span>
          <span className="cartography-mountain">▲ ▲ ▲</span>
          <span className="cartography-town">✦<small>شهر ماجراجویان</small></span>
          <span className="cartography-path" />
          <span className="cartography-seal">D20</span>
        </div>
      </div>
    </section>
    <section className="cartography-next" aria-label="امکانات برنامه‌ریزی‌شده">
      <span>روی میز کار نقشه‌نگار</span>
      <div><strong>ساخت نقشه</strong><strong>کتابخانهٔ نقشه‌ها</strong><strong>افزودن به VTT</strong></div>
      <p>ابزار ساخت و اتصال نقشه در حال توسعه است.</p>
    </section>
  </main>;
}
