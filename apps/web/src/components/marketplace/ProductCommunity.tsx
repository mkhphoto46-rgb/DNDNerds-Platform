'use client';

import Link from 'next/link';
import {useEffect, useId, useState, type FormEvent} from 'react';
import styles from './product-community.module.css';

type Entry = {id:string;kind:'COMMENT'|'REVIEW';body:string;rating:number|null;createdAt:string;authorName:string;verifiedPurchase:boolean};
type Community = {data:Entry[];rating:{count:number;average:number;histogram:Record<string,number>};viewer:{authenticated:boolean;canComment:boolean;canReview:boolean;entries?:{id:string;kind:'COMMENT'|'REVIEW';body:string;rating:number|null;status:string}[]};nextCursor?:string|null};
const number = (value:number) => value.toLocaleString('fa-IR', {maximumFractionDigits:1});

export function ProductCommunity({productId,productName}:{productId:string;productName?:string}) {
  const headingId=useId();
  const [content,setContent]=useState<Community|null>(null);
  const [loading,setLoading]=useState(true),[loadingMore,setLoadingMore]=useState(false),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[kind,setKind]=useState<'COMMENT'|'REVIEW'>('COMMENT');
  const [body,setBody]=useState(''),[rating,setRating]=useState('5'),[retry,setRetry]=useState(0),[loginHref,setLoginHref]=useState('/login');
  const endpoint=`/api/marketplace/v21/products/${encodeURIComponent(productId)}/community`;

  useEffect(()=>{
    const controller=new AbortController();
    setContent(null);setLoading(true);setError('');setNotice('');setKind('COMMENT');setBody('');
    setLoginHref(`/login?next=${encodeURIComponent(window.location.pathname+window.location.search+'#product-community')}`);
    fetch(endpoint,{cache:'no-store',signal:controller.signal}).then(async response=>{
      const data=await response.json();
      if(!response.ok)throw new Error(data.error?.message??'دریافت دیدگاه‌ها انجام نشد.');
      setContent(data as Community);
    }).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'دریافت دیدگاه‌ها انجام نشد.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[endpoint,retry]);

  async function loadMore(){
    if(!content?.nextCursor||loadingMore)return;
    setLoadingMore(true);setError('');
    try{
      const response=await fetch(`${endpoint}?cursor=${encodeURIComponent(content.nextCursor)}`,{cache:'no-store'});
      const data=await response.json();if(!response.ok)throw new Error(data.error?.message??'دیدگاه‌های بیشتر دریافت نشد.');
      setContent(current=>current?{...data,data:[...current.data,...data.data.filter((entry:Entry)=>!current.data.some(old=>old.id===entry.id))]}:data);
    }catch(reason){setError(reason instanceof Error?reason.message:'دیدگاه‌های بیشتر دریافت نشد.');}finally{setLoadingMore(false);}
  }

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;setBusy(true);setNotice('');setError('');
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind,body:body.trim(),...(kind==='REVIEW'?{rating:Number(rating)}:{})})});
      const data=await response.json();if(!response.ok)throw new Error(data.error?.message??'ثبت دیدگاه انجام نشد.');
      setBody('');setNotice(kind==='REVIEW'?'تجربهٔ خرید شما برای بررسی ثبت شد. پس از تأیید در این صفحه نمایش داده می‌شود.':'نظر یا پرسش شما برای بررسی ثبت شد. پس از تأیید در این صفحه نمایش داده می‌شود.');
    }catch(reason){setError(reason instanceof Error?reason.message:'ثبت دیدگاه انجام نشد. متن شما حفظ شده است.');}finally{setBusy(false);}
  }

  return <section id="product-community" className={styles.community} aria-labelledby={headingId} dir="rtl">
    <header className={styles.header}><div><span className={styles.eyebrow}>گفت‌وگو دربارهٔ محصول</span><h2 id={headingId}>نظرات و پرسش‌ها</h2>{productName&&<p>{productName}</p>}</div>{content&&<span className={styles.count}>{number(content.rating.count)} امتیاز خرید</span>}</header>
    {loading&&<p role="status">در حال دریافت دیدگاه‌ها…</p>}
    {error&&<div className={styles.error} role="alert">{error}{!content&&<button type="button" onClick={()=>setRetry(value=>value+1)}>تلاش دوباره</button>}</div>}
    {content&&<>
      <div className={styles.overview}>
        <aside className={styles.statistics} aria-label="امتیاز خریداران">
          <h3>امتیاز خریداران</h3>{content.rating.count>0?<><div className={styles.score}><strong>{number(content.rating.average)}</strong><span>از ۵</span></div><p>از {number(content.rating.count)} تجربهٔ خرید</p></>:<p>هنوز امتیازی از خریداران ثبت نشده است.</p>}
          <div className={styles.histogram}>{[5,4,3,2,1].map(stars=>{const count=content.rating.histogram[String(stars)]??0;return <div className={styles.ratingRow} key={stars}><span>{number(stars)} <span aria-hidden="true">★</span></span><meter min={0} max={Math.max(1,content.rating.count)} value={count} aria-label={`${number(stars)} ستاره: ${number(count)} رأی`}/><span>{number(count)}</span></div>;})}</div>
        </aside>
        <div className={styles.compose}>
          <h3>دیدگاه شما</h3>
          {!content.viewer.authenticated?<p>برای نوشتن نظر یا پرسش <Link href={loginHref}>وارد حساب خود شوید</Link>.</p>:<>
            {content.viewer.canReview&&<div className={styles.toggle} role="group" aria-label="نوع دیدگاه"><button type="button" aria-pressed={kind==='COMMENT'} onClick={()=>setKind('COMMENT')} disabled={busy}>نظر یا پرسش</button><button type="button" aria-pressed={kind==='REVIEW'} onClick={()=>setKind('REVIEW')} disabled={busy}>تجربهٔ خرید و امتیاز</button></div>}
            {!content.viewer.canReview&&<p className={styles.hint}>می‌توانید نظر یا پرسش بنویسید. امتیازدهی پس از خرید و تأیید تحویل این محصول در دسترس است.</p>}
            <form onSubmit={submit} className={styles.form}>
              {kind==='REVIEW'&&content.viewer.canReview&&<label>امتیاز شما<select value={rating} onChange={event=>setRating(event.target.value)} disabled={busy} required>{[5,4,3,2,1].map(value=><option value={value} key={value}>{number(value)} از ۵</option>)}</select></label>}
              <label>{kind==='REVIEW'?'تجربهٔ خرید شما':'نظر یا پرسش شما'}<textarea value={body} onChange={event=>setBody(event.target.value)} minLength={3} maxLength={2000} rows={4} required disabled={busy} placeholder="دربارهٔ همین محصول بنویسید…"/></label>
              <div className={styles.formFooter}><span className={styles.hint}>دیدگاه پس از بررسی منتشر می‌شود.</span><button type="submit" disabled={busy||body.trim().length<3}>{busy?'در حال ثبت…':'ثبت دیدگاه'}</button></div>
            </form>
          </>}
          <p role="status" className={styles.notice}>{notice}</p>
          {!notice&&content.viewer.entries?.some(entry=>entry.status==='PENDING')&&<p className={styles.hint}>دیدگاه شما در انتظار بررسی است و هنوز در فهرست عمومی نمایش داده نمی‌شود.</p>}
        </div>
      </div>
      <div className={styles.entries} aria-label="دیدگاه‌های منتشرشده">{content.data.map(entry=><article className={styles.entry} key={entry.id}><header className={styles.entryHeader}><strong>{entry.authorName||'کاربر'}</strong><span>{entry.kind==='REVIEW'?'تجربهٔ خرید':'نظر یا پرسش'}</span>{entry.rating!==null&&<span className={styles.stars} aria-label={`امتیاز ${number(entry.rating)} از ۵`}>{number(entry.rating)} ★</span>}<time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString('fa-IR')}</time></header>{entry.verifiedPurchase&&<span className={styles.verified}>خرید و تحویل تأییدشده</span>}<p className={styles.body}>{entry.body}</p></article>)}{content.data.length===0&&<p className={styles.empty}>هنوز نظر یا پرسشی برای این محصول منتشر نشده است.</p>}</div>
      {content.nextCursor&&<button className={styles.more} type="button" disabled={loadingMore} onClick={()=>void loadMore()}>{loadingMore?'در حال دریافت…':'دیدگاه‌های بیشتر'}</button>}
    </>}
  </section>;
}

export default ProductCommunity;
