"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {profileRequest} from "@/lib/profile-pages";
import styles from "@/components/community.module.css";
type Feedback={id:string;username:string|null;kind:string;subject:string;message:string;status:string;createdAt:string};
const kinds:Record<string,string>={SUGGESTION:"پیشنهاد",CRITICISM:"انتقاد",COMMENT:"نظر"};
export default function FeedbackAdmin(){const [items,setItems]=useState<Feedback[]|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState<string|null>(null);
 useEffect(()=>{void profileRequest<Feedback[]>("admin/feedback").then(setItems).catch(e=>setError(e.message));},[]);
 async function status(item:Feedback,value:string){setBusy(item.id);setError("");try{await profileRequest(`admin/feedback/${item.id}/status`,"PUT",{status:value});setItems(current=>current?.map(row=>row.id===item.id?{...row,status:value}:row)??null);}catch(e){setError(e instanceof Error?e.message:"ذخیره انجام نشد.");}finally{setBusy(null);}}
 return <main className={styles.page}><div className={styles.shell}><Link className={styles.back} href="/admin">بازگشت به مدیریت ←</Link><header className={styles.hero}><h1>بازخوردهای کاربران</h1><p>جدیدترین پیام‌ها؛ فقط مدیران مجاز به مشاهده و بررسی هستند.</p></header>{error&&<p role="alert" className={`${styles.notice} ${styles.error}`}>{error}</p>}{items===null&&!error&&<p role="status">در حال بارگذاری…</p>}<div className={styles.history}>{items?.map(item=><article key={item.id}><div className={styles.meta}><span>{kinds[item.kind]} · {item.username??"کاربر"}</span><time>{new Date(item.createdAt).toLocaleDateString("fa-IR")}</time></div><h3>{item.subject}</h3><p className={styles.message}>{item.message}</p><label>وضعیت بررسی <select className={styles.statusSelect} aria-label={`وضعیت ${item.subject}`} value={item.status} disabled={busy===item.id} onChange={e=>void status(item,e.target.value)}><option value="NEW">جدید</option><option value="READ">دیده شده</option><option value="RESOLVED">بررسی شده</option></select></label></article>)}</div>{items?.length===0&&<p>پیامی ثبت نشده است.</p>}</div></main>;
}
