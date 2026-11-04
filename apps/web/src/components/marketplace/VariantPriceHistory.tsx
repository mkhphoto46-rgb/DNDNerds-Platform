'use client';
import {useState} from 'react';
type Entry={id:string;oldPriceRial:number|null;newPriceRial:number;effectiveAt:string;actorName:string|null;reason:string|null;
  oldState:{discount?:number|null};newState:{discount?:number|null}};
const price=(n:number|null|undefined)=>n==null?'—':(Number(n)/10).toLocaleString('fa-IR')+' تومان';
export function VariantPriceHistory({storeId,variantId}:{storeId:string;variantId:string}){
 const [rows,setRows]=useState<Entry[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function load(){setBusy(true);try{
   const r=await fetch(`/api/marketplace/v21/seller/stores/${storeId}/variants/${variantId}/price-history`);const b=await r.json();
   if(!r.ok)throw new Error(b.error?.message??'سابقه دریافت نشد.');setRows(b.data);setMessage(b.data.length?'':'سابقه‌ای ثبت نشده است.');
 }catch(e){setMessage(e instanceof Error?e.message:'سابقه دریافت نشد.');}finally{setBusy(false);}}
 return <details><summary>سابقهٔ قیمت و تخفیف</summary><button type="button" disabled={busy} onClick={()=>void load()}>{busy?'در حال دریافت…':'دریافت سابقه'}</button>
  <p role="status">{message}</p><ol>{rows.map(h=><li key={h.id}>
   <p>{new Date(h.effectiveAt).toLocaleString('fa-IR')} · {h.oldPriceRial===null?'قیمت اولیه':price(h.oldPriceRial)+' ←'} {price(h.newPriceRial)}</p>
   <p>قیمت تخفیف: {price(h.oldState.discount)} ← {price(h.newState.discount)}</p>
   <p>{h.actorName??'عامل ثبت نشده'} · {h.reason??'دلیل در سابقهٔ قدیمی ثبت نشده'}</p>
  </li>)}</ol></details>;
}
