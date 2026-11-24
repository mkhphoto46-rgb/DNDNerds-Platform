import Link from "next/link";
import { notFound } from "next/navigation";
import { knowledgeCategories,knowledgeArticles,articlePath } from "@/lib/knowledge";
import { HomebrewList } from "@/components/homebrew";
import styles from "../knowledge.module.css";
export async function generateMetadata(
  { params }: { params: Promise<{ category: string }> }
) {
  const { category } = await params;
  const current = knowledgeCategories.find(c => c.slug === category);

  if (!current) {
    return {
      title: "Knowledge",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: current.title,
    alternates: {
      canonical: `https://dndnerds.ir/knowledge/${encodeURIComponent(current.slug)}`,
    },
  };
}
export default async function Page({params}:{params:Promise<{category:string}>}){const {category}=await params;const current=knowledgeCategories.find(c=>c.slug===category);if(!current)notFound();return <main className={styles.page}><div className="shell"><nav className={styles.crumbs} aria-label="مسیر دانشنامه"><Link href="/knowledge">دانشنامه</Link><span>/</span><span>{current.title}</span></nav><header className={styles.intro}><h1>{current.title}</h1><p>{current.description}</p></header>{category==="homebrew"&&<div className={styles.actions}><Link className={styles.button} href="/knowledge/homebrew/new">نوشتن هوم‌برو</Link><Link className={styles.button} href="/knowledge/homebrew/mine">نوشته‌های من</Link></div>}<div className={styles.grid}>{knowledgeArticles.filter(a=>a.category===category).map(a=><Link className={styles.card} href={articlePath(a)} key={a.slug}><small>مقالهٔ DND Nerds · {Math.max(1,Math.ceil(a.sections.map(s=>s[1]).join(" ").split(/\s+/).length/180))} دقیقه مطالعه</small><h2>{a.title}</h2><p>{a.summary}</p><span>خواندن مقاله ←</span></Link>)}</div>{category==="homebrew"&&<HomebrewList/>}</div></main>}
