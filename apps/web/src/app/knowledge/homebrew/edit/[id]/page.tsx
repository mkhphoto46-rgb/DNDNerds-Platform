import Link from "next/link";
import {HomebrewEditor} from "@/components/homebrew";
import styles from "@/app/knowledge/knowledge.module.css";
export const metadata={title:'ویرایش هوم\u200cبرو'};
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <main className={styles.page}><div className="shell"><nav className={styles.crumbs} aria-label="مسیر هوم‌برو"><Link href="/knowledge">دانشنامه</Link><span>/</span><Link href="/knowledge/homebrew">هوم‌برو</Link></nav><article className={styles.article}><h1>ویرایش هوم‌برو</h1><HomebrewEditor id={id}/></article></div></main>}