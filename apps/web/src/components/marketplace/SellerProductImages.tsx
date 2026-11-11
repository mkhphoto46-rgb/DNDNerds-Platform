'use client';

import {useState, type FormEvent} from 'react';
import {compressProductImage} from '@/lib/marketplace-image';
import styles from './storefront.module.css';

export function SellerProductImages({storeId, productId, initialUrls}:{
  storeId:string; productId:string; initialUrls:string[];
}) {
  const [saved,setSaved]=useState(initialUrls);
  const [keep,setKeep]=useState(initialUrls);
  const [files,setFiles]=useState<File[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const count=keep.length+files.length;

  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||count>5)return;
    const form=event.currentTarget;
    setBusy(true);
    setMessage('');
    try{
      const uploads:string[]=[];
      for(const file of files)uploads.push(await compressProductImage(file));
      const response=await fetch(`/api/marketplace/v21/seller/stores/${storeId}/products/${productId}/images`,{
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({previous:saved,keep,uploads,publishConsent:true}),
      });
      const result=await response.json();
      if(!response.ok)throw new Error(result.error?.message??'ذخیرهٔ تصاویر انجام نشد.');
      setSaved(result.imageUrls);
      setKeep(result.imageUrls);
      setFiles([]);
      form.reset();
      setMessage('تصاویر محصول ذخیره شدند.');
    }catch(error){
      setMessage(error instanceof Error?error.message:'بارگذاری انجام نشد.');
    }finally{
      setBusy(false);
    }
  }

  return <form className={styles.sellerImages} onSubmit={save}>
    <strong>تصاویر محصول · {count.toLocaleString('fa-IR')} از ۵</strong>
    {keep.length>0&&<div className={styles.thumbnails}>{keep.map((url,index)=><div key={url}>
      <img src={url} alt={index===0?'تصویر اصلی':`تصویر ${index+1}`}/>
      <button type="button" disabled={busy} onClick={()=>setKeep(keep.filter(item=>item!==url))} aria-label={`حذف تصویر ${index+1}`}>حذف</button>
    </div>)}</div>}
    <label>افزودن عکس<input type="file" multiple accept="image/*" disabled={busy||keep.length===5} onChange={event=>{
      const selected=Array.from(event.currentTarget.files??[]);
      if(selected.length+keep.length>5){
        event.currentTarget.value='';
        setFiles([]);
        setMessage('برای هر محصول حداکثر ۵ تصویر مجاز است.');
        return;
      }
      setFiles(selected);
      setMessage('');
    }}/></label>
    {files.length>0&&<label><input type="checkbox" required disabled={busy}/> اجازهٔ نمایش عمومی عکس‌های انتخاب‌شده را دارم.</label>}
    <div className={styles.imageActions}>
      <button type="submit" className="site-secondary" disabled={busy||count>5||(!files.length&&keep.length===saved.length)}>{busy?'در حال ذخیره…':'ذخیرهٔ تصاویر'}</button>
      {keep.length!==saved.length&&<button type="button" className="site-secondary" disabled={busy} onClick={()=>setKeep(saved)}>بازگرداندن عکس‌ها</button>}
    </div>
    <span role="status">{message}</span>
  </form>;
}
