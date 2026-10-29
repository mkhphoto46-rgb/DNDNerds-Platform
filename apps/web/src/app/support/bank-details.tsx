"use client";
import { useState } from "react";
import type { SupportDetails } from "@/lib/support-details";
import styles from "@/components/community.module.css";
export default function BankDetails({ details: supportDetails }: { details: SupportDetails }) {
 const [message,setMessage]=useState("");
 async function copy(label:string,value:string){try{await navigator.clipboard.writeText(value);setMessage(`${label} کپی شد.`);}catch{setMessage("کپی خودکار انجام نشد؛ شماره را انتخاب و کپی کن.");}}
 return <section className={styles.card} aria-labelledby="transfer-title"><h2 id="transfer-title">حمایت با واریز مستقیم</h2><dl className={styles.transfer}>
 <div><dt>به نام</dt><dd><strong>{supportDetails.name}</strong></dd></div>
 <div><dt>شماره کارت / حساب</dt><dd><span className={styles.number} dir="ltr">{supportDetails.account.replace(/(.{4})(?=.)/g,"$1 ")}</span><button type="button" className={styles.copy} onClick={()=>void copy("شماره واریز",supportDetails.account)}>کپی شماره</button></dd></div>
 <div><dt>شماره شبا</dt><dd><span className={styles.number} dir="ltr">{supportDetails.iban}</span><button type="button" className={styles.copy} onClick={()=>void copy("شماره شبا",supportDetails.iban)}>کپی شبا</button></dd></div>
 </dl><p className={styles.small}>فعلاً درگاه آنلاین نداریم؛ حمایت از طریق واریز دستی انجام می‌شود.</p><p role="status" aria-live="polite" className={styles.small}>{message}</p></section>;
}
