import Link from "next/link";
import { knowledgeCategories } from "@/lib/knowledge";
import { SiteIcon } from "@/components/site-icon";
import styles from "./knowledge.module.css";
export const metadata={title:"دانشنامه",description:"داستان‌ها و ماژول‌ها، هوم‌برو، قوانین و راهنمای تجهیزات D&D"};
export default function Page(){return <main className={styles.page}><div className="shell"><header className={styles.intro}><span className="section-kicker">بخوان، بساز، بازی کن</span><h1>دانشنامه</h1><p>یک مسیر را انتخاب کن؛ مقاله‌ها و نوشته‌های هر موضوع در بخش خودش منتظرت هستند.</p></header><nav className={styles.grid} aria-label="دسته‌بندی دانشنامه">{knowledgeCategories.map(c=><Link className={styles.card} href={`/knowledge/${c.slug}`} key={c.slug}><SiteIcon name={c.icon}/><h2>{c.title}</h2><p>{c.description}</p><span>ورود به این بخش ←</span></Link>)}</nav></div></main>}
