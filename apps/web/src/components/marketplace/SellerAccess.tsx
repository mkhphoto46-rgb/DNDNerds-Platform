'use client';
import {useEffect,useState,type FormEvent} from 'react';
import Link from 'next/link';
import styles from '@/app/store/marketplace.module.css';
type Account={userId:string;email:string;username:string|null;status:string;sellerId:string|null;sellerStatus:string|null;storeName:string|null};
async function request(url:string,body?:unknown){const r=await fetch(url,{cache:'no-store',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});const b=await r.json();if(!r.ok)throw new Error(b.error?.message??'عملیات انجام نشد.');return b;}
export function SellerAccess(){
 const [query,setQuery]=useState(''),[accounts,setAccounts]=useState<Account[]>([]),[selected,setSelected]=useState<Account|null>(null),[categories,setCategories]=useState<{slug:string;label:string}[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function search(e?:FormEvent){e?.preventDefault();setBusy(true);setMessage('');try{const b=await request('/api/admin/marketplace/seller-access?q='+encodeURIComponent(query.trim()));setAccounts(b.data);setSelected(null);if(!b.data.length)setMessage('حسابی با این ایمیل یا نام کاربری پیدا نشد.');}catch(e){setMessage(e instanceof Error?e.message:'جست‌وجو انجام نشد.');}finally{setBusy(false);}}
 useEffect(()=>{void request('/api/marketplace/v21/categories').then(b=>setCategories(b.data)).catch(()=>{});const id=new URLSearchParams(window.location.search).get('userId');if(id)void request('/api/admin/marketplace/seller-access?userId='+encodeURIComponent(id)).then(b=>{setAccounts(b.data);setSelected(b.data[0]??null);}).catch(e=>setMessage(e.message));},[]);
 async function assign(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!selected)return;const d=new FormData(e.currentTarget);setBusy(true);setMessage('');try{
  const credentials={password:d.get('password'),reason:d.get('reason')};
  if(selected.sellerId)await request(`/api/admin/marketplace/sellers/${selected.sellerId}/moderate`,{...credentials,action:'APPROVE'});
  else await request('/api/admin/marketplace/seller-access',{...credentials,userId:selected.userId,name:d.get('name'),slug:d.get('slug'),category:d.get('category')});
  setMessage('دسترسی فروشندگی فعال شد. کاربر اکنون می‌تواند وارد کارگاه فروشگاه من شود.');setSelected(null);setAccounts([]);
 }catch(e){setMessage(e instanceof Error?e.message:'ثبت انجام نشد.');}finally{setBusy(false);}}
 return <section className={styles.section} aria-labelledby="seller-access-title"><h2 id="seller-access-title">مدیریت دسترسی فروشندگان</h2><p>حساب ثبت‌شده را با ایمیل کامل یا نام کاربری پیدا کن و فروشگاهش را فعال کن. نشان احراز هویت جداگانه بررسی می‌شود.</p>
 <form className={styles.marketFilters} onSubmit={search}><label>ایمیل یا نام کاربری<input value={query} onChange={e=>setQuery(e.target.value)} minLength={3} maxLength={254} required/></label><button disabled={busy}>جست‌وجوی حساب</button><Link href="/admin/accounts">فهرست کاربران</Link></form>
 <p role="status">{message}</p>{accounts.map(a=><article className={styles.variantPanel} key={a.userId}><strong dir="ltr">{a.email}</strong><span>{a.username} · {a.sellerId?`${a.storeName??'فروشنده'} · ${a.sellerStatus}`:'هنوز فروشنده نشده'}</span><button disabled={busy||a.status!=='ACTIVE'} onClick={()=>setSelected(a)}>{a.sellerId?'بررسی / فعال‌سازی فروشندگی':'ایجاد دسترسی فروشندگی'}</button>{a.status!=='ACTIVE'&&<p>ابتدا حساب را از فهرست کاربران فعال کن.</p>}</article>)}
 {selected&&<form className={styles.marketFilters} onSubmit={assign} key={selected.userId}><p>حساب انتخاب‌شده: <bdi>{selected.email}</bdi></p>{!selected.sellerId&&<><label>نام فروشگاه<input name="name" minLength={3} maxLength={160} required/></label><label>شناسهٔ یکتای آدرس فروشگاه<input name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={3} maxLength={63} dir="ltr" placeholder="my-store" required/></label><label>دسته‌بندی<select name="category" required>{categories.map(c=><option key={c.slug} value={c.slug}>{c.label}</option>)}</select></label></>}
 <label>دلیل فعال‌سازی<input name="reason" minLength={3} maxLength={500} required/></label><label>رمز حساب مدیر<input type="password" name="password" autoComplete="current-password" maxLength={128} required/></label><button disabled={busy}>{busy?'در حال ثبت…':'فعال‌کردن فروشندگی'}</button><button type="button" disabled={busy} onClick={()=>setSelected(null)}>انصراف</button></form>}
 </section>;
}
