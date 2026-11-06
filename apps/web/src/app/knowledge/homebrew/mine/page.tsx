import Link from "next/link";
import {HomebrewEditor,HomebrewList,HomebrewReader} from "@/components/homebrew";
import styles from "@/app/knowledge/knowledge.module.css";
export const metadata={title:'نوشته\u200cهای من'};
export default function Page(){return <main className={styles.page}><div className="shell"><nav className={styles.crumbs} aria-label="مسیر هوم‌برو"><Link href="/knowledge">دانشنامه</Link><span>/</span><Link href="/knowledge/homebrew">هوم‌برو</Link></nav><article className={styles.article}><h1>نوشته‌های من</h1><HomebrewList mine/></article></div></main>}