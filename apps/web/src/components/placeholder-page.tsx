import Link from "next/link";

type PlaceholderPageProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export function PlaceholderPage({
  eyebrow,
  title,
  description,
}: PlaceholderPageProps) {
  return (
    <main className="placeholder-page">
      <section className="shell placeholder-content">

        <div className="section-kicker">
          {eyebrow}
        </div>

        <h1>{title}</h1>

        <p>{description}</p>

        <div className="placeholder-status">
          <span className="status-dot" />
          این بخش در مسیر توسعه قرار دارد
        </div>

        <div className="hero-actions">
          <Link className="button button-primary" href="/">
            بازگشت به خانه
          </Link>

          <Link className="button button-ghost" href="/register">
            ساخت حساب
          </Link>
        </div>

      </section>
    </main>
  );
}