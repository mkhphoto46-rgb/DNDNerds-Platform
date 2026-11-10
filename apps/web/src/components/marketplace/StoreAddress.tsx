'use client';
import {useEffect,useState} from 'react';
import {storeAddress} from '@/lib/store-address';
export function StoreAddress({slug}:{slug:string}){
 const url=storeAddress(slug);const [message,setMessage]=useState('');const [enabled,setEnabled]=useState(false);
 useEffect(()=>{const controller=new AbortController();fetch('/api/store-domains/status',{cache:'no-store',signal:controller.signal}).then(r=>r.ok?r.json():null).then(b=>{if(!controller.signal.aborted)setEnabled(b?.enabled===true);}).catch(()=>{});return()=>controller.abort();},[]);
 if(!url)return null;
 return <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',marginBlock:16}}><span>آدرس اختصاصی فروشگاه:</span><a href={enabled?url:undefined} dir="ltr" style={{overflowWrap:'anywhere'}}>{url.replace('https://','')}</a>{!enabled&&<span>در حال فعال‌سازی</span>}<button type="button" disabled={!enabled} onClick={async()=>{try{await navigator.clipboard.writeText(url);setMessage('لینک فروشگاه کپی شد.');}catch{setMessage('لینک بالا را انتخاب و کپی کنید.');}}}>کپی لینک</button><span role="status">{message}</span></div>;
}
