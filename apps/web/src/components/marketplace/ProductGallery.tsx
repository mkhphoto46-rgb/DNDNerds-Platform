'use client';
import {useRef,useState} from 'react';
import styles from './storefront.module.css';
export function ProductGallery({images,name}:{images:string[];name:string}){
 const [selected,setSelected]=useState(0);
 const src=images[selected]??images[0];
 const dialog=useRef<HTMLDialogElement>(null);
 if(!src)return <div className={styles.gallery}><div className={styles.noImage}><span aria-hidden="true">✦</span><p>تصویر محصول</p></div></div>;
 return <div className={styles.gallery}><button type="button" className={styles.imageButton} onClick={()=>dialog.current?.showModal()} aria-label={`بزرگ‌نمایی تصویر ${name}`}><img src={src} alt={name} fetchPriority="high"/><span className={styles.zoomHint}>بزرگ‌نمایی تصویر ↗</span></button>
 {images.length>1&&<div className={styles.thumbnails} aria-label="تصاویر محصول">{images.map((url,index)=>
   <button type="button" key={url+index} aria-label={`نمایش تصویر ${(index+1).toLocaleString('fa-IR')}`} aria-pressed={selected===index} onClick={()=>setSelected(index)}><img src={url} alt="" loading="lazy"/></button>
 )}</div>}
 <dialog ref={dialog} className={styles.imageDialog} aria-label={`تصویر ${name}`} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}><button type="button" className={styles.closeImage} onClick={()=>dialog.current?.close()}>بستن ×</button><img src={src} alt={name}/></dialog></div>;
}
