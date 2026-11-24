import Link from "next/link";
import {notFound} from "next/navigation";
import {knowledgeArticles,knowledgeCategories} from "@/lib/knowledge";
import styles from "../../knowledge.module.css";
export async function generateMetadata(
  { params }: { params: Promise<{ category: string; slug: string }> }
) {
  const { category, slug } = await params;
  const article = knowledgeArticles.find(
    a => a.category === category && a.slug === slug
  );

  if (!article) {
    return {
      title: "Article",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: article.title,
    description: article.summary,
    alternates: {
      canonical: `https://dndnerds.ir/knowledge/${encodeURIComponent(article.category)}/${encodeURIComponent(article.slug)}`,
    },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await params;
  const a = knowledgeArticles.find(
    a => a.category === category && a.slug === slug
  );
  if (!a) notFound();

  const c = knowledgeCategories.find(c => c.slug === category)!;

  return (
    <main className={styles.page}>
      <div className="shell">
        <nav className={styles.crumbs} aria-label="مسیر مقاله">
          <Link href="/knowledge">دانشنامه</Link>
          <span>/</span>
          <Link href={`/knowledge/${category}`}>{c.title}</Link>
        </nav>

        <article className={styles.article}>
          <small>تحریریهٔ DND Nerds · {c.title}</small>
          <h1>{a.title}</h1>

          {a.illustrated ? (
            <div className={styles.articleIllustrated}>
              {a.cover && (
                <img
                  className={styles.articleArt}
                  src={a.cover.src}
                  alt={a.cover.alt}
                  width={a.cover.width}
                  height={a.cover.height}
                  loading="eager"
                  decoding="async"
                />
              )}
              <p>{a.summary}</p>
            </div>
          ) : (
            <p>{a.summary}</p>
          )}

          <nav className={styles.toc} aria-label="فهرست مقاله">
            {a.sections.map(([h], i) => (
              <a href={`#part-${i}`} key={h}>{h}</a>
            ))}
          </nav>

          {a.sections.map(([h, p], i) => {
            const art = a.sectionArt?.[String(i)];

            return (
              <section
                id={`part-${i}`}
                key={h}
                className={
                  a.illustrated
                    ? styles.articleIllustrated
                    : undefined
                }
              >
                <h2>{h}</h2>
                {art && (
                  <img
                    className={styles.articleArt}
                    src={art.src}
                    alt={art.alt}
                    width={art.width}
                    height={art.height}
                    loading="lazy"
                    decoding="async"
                  />
                )}
                <p>{p}</p>
              </section>
            );
          })}

          {a.sources && a.showSources !== false && (
            <aside>
              <h2>مرجع و نسخهٔ قواعد</h2>
              <p>متن بالا آموزش و توضیح مستقل است؛ برای حکم دقیق به مرجع نسخهٔ میز خودت رجوع کن.</p>
              {a.sources.map(([title, url]) => (
                <p key={url}>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {title} ↗
                  </a>
                </p>
              ))}
            </aside>
          )}

          {a.followup && (
            <section aria-labelledby="start-playing-actions">
              <h2 id="start-playing-actions">{a.followup.heading}</h2>
              <p>{a.followup.text}</p>
              <div className={styles.actions}>
                {a.followup.links.map(link => (
                  <Link
                    className={styles.button}
                    href={link.href}
                    key={link.href}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </section>
          )}

          <div className={styles.actions}>
            <Link
              className={styles.button}
              href={`/knowledge/${category}`}
            >
              بازگشت به {c.title}
            </Link>

            {category === "equipment" && (
              <Link className={styles.button} href="/store">
                دیدن بازارچه
              </Link>
            )}

            {category === "stories" && (
              <Link className={styles.button} href="/games">
                شروع ماجراجویی
              </Link>
            )}
          </div>
        </article>
      </div>
    </main>
  );
}
