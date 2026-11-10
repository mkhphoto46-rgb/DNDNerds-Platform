'use client';
import {useState} from 'react';
import {storeAddress} from '@/lib/store-address';
export function StoreAddress({slug}:{slug:string}){
 const url=storeAddress(slug);const [message,setMessage]=useState('');if(!url)return null;
 return <div style={{display:'flex',gap:12,alignItems:'center',flexWrap:'wrap',marginBlock:16}}><span>آدرس اختصاصی فروشگاه:</span><a href={url} dir="ltr" style={{overflowWrap:'anywhere'}}>{url.replace('https://','')}</a><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(url);setMessage('لینک فروشگاه کپی شد.');}catch{setMessage('لینک بالا را انتخاب و کپی کنید.');}}}>کپی لینک</button><span role="status">{message}</span></div>;
}
