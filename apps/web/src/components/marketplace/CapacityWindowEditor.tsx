'use client';
import {useState,type FormEvent} from 'react';
import styles from '@/app/store/marketplace.module.css';
type Window={id:string;version:number;status:string;startsAt:string;endsAt:string;orderCutoffAt:string;capacity:number;reserved:number;committed:number};
export function CapacityWindowEditor({storeId,variantId,name}:{storeId:string;variantId:string;name:string}){
 const [windows,setWindows]=useState<Window[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const path=`/api/marketplace/v21/seller/stores/${storeId}/variants/${variantId}/capacity-windows`;
 async function load(){try{const r=await fetch(path);const b=await r.json();if(!r.ok)throw new Error(b.error?.message??'بازه‌ها دریافت نشد.');setWindows(b.data);}catch(e){setMessage(e instanceof Error?e.message:'دریافت انجام نشد.');}}
 async function save(method:string,body:unknown,id=''){setBusy(true);try{const r=await fetch(path+(id?'/'+id:''),{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});const b=await r.json();if(!r.ok)throw new Error(b.error?.message??'ذخیره انجام نشد.');setMessage('برنامهٔ ساخت ذخیره شد.');await load();}catch(e){setMessage(e instanceof Error?e.message:'ذخیره انجام نشد.');}finally{setBusy(false);}}
 function create(e:FormEvent<HTMLFormElement>){e.preventDefault();const d=new FormData(e.currentTarget);void save('POST',{startsAt:new Date(String(d.get('starts'))).toISOString(),endsAt:new Date(String(d.get('ends'))).toISOString(),orderCutoffAt:new Date(String(d.get('cutoff'))).toISOString(),capacity:Number(d.get('capacity')),reason:d.get('reason')});}
 return <details className={styles.variantPanel} onToggle={e=>{if(e.currentTarget.open)void load();}}><summary>بازه‌های ساخت · {name}</summary>
  <p>سفارش ساخت به ظرفیت کلی تنوع و ظرفیت بازهٔ انتخابی محدود است. تاریخ بازهٔ ثبت‌شده ثابت می‌ماند.</p><p role="status">{message}</p>
  <form className={styles.marketFilters} onSubmit={create}><label>شروع ساخت<input name="starts" type="datetime-local" required/></label><label>پایان ساخت<input name="ends" type="datetime-local" required/></label><label>آخرین مهلت سفارش<input name="cutoff" type="datetime-local" required/></label><label>ظرفیت بازه<input name="capacity" type="number" min="1" max="1000000" required/></label><label>دلیل برنامه<input name="reason" minLength={3} maxLength={500} required/></label><button disabled={busy}>افزودن بازه</button></form>
  {windows.map(w=><form className={styles.marketFilters} key={w.id+':'+w.version} onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);void save('PATCH',{expectedVersion:w.version,capacity:Number(d.get('capacity')),status:d.get('status'),reason:d.get('reason')},w.id);}}>
   <p>{new Date(w.startsAt).toLocaleDateString('fa-IR')} تا {new Date(w.endsAt).toLocaleDateString('fa-IR')} · رزرو {w.reserved} · تخصیص ساخت {w.committed}</p>
   <label>ظرفیت<input key={w.version} name="capacity" type="number" min={Math.max(1,w.reserved+w.committed)} max="1000000" defaultValue={w.capacity} required/></label>
   <label>وضعیت<select name="status" defaultValue={w.status}><option value="OPEN">باز برای سفارش</option><option value="CLOSED">بسته برای سفارش تازه</option></select></label><label>دلیل تغییر<input name="reason" minLength={3} maxLength={500} required/></label><button disabled={busy}>ذخیرهٔ بازه</button>
  </form>)}
 </details>;
}
