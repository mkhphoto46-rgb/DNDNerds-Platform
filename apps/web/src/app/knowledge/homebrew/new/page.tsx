import Link from "next/link";
import {HomebrewEditor,HomebrewList,HomebrewReader} from "@/components/homebrew";
import styles from "@/app/knowledge/knowledge.module.css";
export const metadata={title:'نوشتن هوم\u200cبرو'};
export default function Page(){return <main className={styles.page}><div className="shell"><nav className={styles.crumbs} aria-label="مسیر هوم‌برو"><Link href="/knowledge">دانشنامه</Link><span>/</span><Link href="/knowledge/homebrew">هوم‌برو</Link></nav><article className={styles.article}><h1>نوشتن هوم‌برو</h1><HomebrewEditor/></article></div></main>}