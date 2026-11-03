'use client';

import {useEffect,useId,useState,type FormEvent} from 'react';
import styles from './product-community.module.css';

type PendingEntry={id:string;kind:'COMMENT'|'REVIEW';body:string;rating:number|null;productName:string;authorName:string;createdAt:string};

export function ProductCommunityModeration(){
  const headingId=useId();
  const [entries,setEntries]=useState<PendingEntry[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<PendingEntry|null>(null),[notice,setNotice]=useState(''),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');
    fetch('/api/admin/marketplace/product-community/queue',{cache:'no-store',signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error?.message??'صف بررسی دریافت نشد.');setEntries(data.data);})
      .catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'صف بررسی دریافت نشد.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[revision]);

  async function moderate(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!selected||busy)return;
    const form=event.currentTarget;const data=new FormData(form);setBusy(true);setNotice('');setError('');
    try{
      const response=await fetch(`/api/admin/marketplace/product-community/${encodeURIComponent(selected.id)}/moderate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({status:data.get('status'),password:data.get('password'),reason:data.get('reason')})});
      const result=await response.json();if(!response.ok)throw new Error(result.error?.message??'نتیجهٔ بررسی ثبت نشد.');
      setEntries(current=>current.filter(entry=>entry.id!==selected.id));setSelected(null);form.reset();setNotice(data.get('status')==='PUBLISHED'?'دیدگاه منتشر شد.':'دیدگاه رد شد.');
    }catch(reason){setError(reason instanceof Error?reason.message:'نتیجهٔ بررسی ثبت نشد.');}finally{setBusy(false);}
  }

  return <section className={styles.community} aria-labelledby={headingId} dir="rtl"><header className={styles.header}><h2 id={headingId}>بررسی نظرات و پرسش‌های محصول</h2><button type="button" disabled={loading||busy} onClick={()=>setRevision(value=>value+1)}>بازخوانی صف</button></header>
    {loading&&<p role="status">در حال دریافت صف بررسی…</p>}<p role="status" className={styles.notice}>{notice}</p>{error&&<p className={styles.error} role="alert">{error}</p>}
    {!loading&&!error&&!entries.length&&<p className={styles.empty}>دیدگاهی در انتظار بررسی نیست.</p>}
    <div className={styles.entries}>{entries.map(entry=><article className={styles.entry} key={entry.id}><header className={styles.entryHeader}><strong>{entry.productName}</strong><span>{entry.authorName||'کاربر'}</span><span>{entry.kind==='REVIEW'?'تجربهٔ خرید':'نظر یا پرسش'}</span>{entry.rating!==null&&<span className={styles.stars}>{entry.rating.toLocaleString('fa-IR')} از ۵</span>}<time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString('fa-IR')}</time></header><p className={styles.body}>{entry.body}</p><button type="button" disabled={busy} onClick={()=>{setSelected(entry);setNotice('');}}>بررسی این دیدگاه</button>
      {selected?.id===entry.id&&<form key={entry.id} onSubmit={moderate} className={styles.form}><label>نتیجهٔ بررسی<select name="status" required disabled={busy}><option value="PUBLISHED">انتشار</option><option value="REJECTED">رد</option></select></label><label>دلیل تصمیم<textarea name="reason" minLength={3} maxLength={500} required disabled={busy}/></label><label>رمز حساب مدیر<input name="password" type="password" autoComplete="current-password" maxLength={128} required disabled={busy}/></label><div className={styles.formFooter}><button type="submit" disabled={busy}>{busy?'در حال ثبت…':'ثبت نتیجهٔ بررسی'}</button><button type="button" disabled={busy} onClick={()=>setSelected(null)}>انصراف</button></div></form>}
    </article>)}</div>
  </section>;
}

export default ProductCommunityModeration;
