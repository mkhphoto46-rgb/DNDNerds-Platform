'use client';
import {useRef} from 'react';
import styles from './storefront.module.css';
export function ProductGallery({src,name}:{src?:string|null;name:string}){
 const dialog=useRef<HTMLDialogElement>(null);
 if(!src)return <div className={styles.gallery}><div className={styles.noImage}><span aria-hidden="true">✦</span><p>تصویر محصول</p></div></div>;
 return <div className={styles.gallery}><button type="button" className={styles.imageButton} onClick={()=>dialog.current?.showModal()} aria-label={`بزرگ‌نمایی تصویر ${name}`}><img src={src} alt={name} fetchPriority="high"/><span className={styles.zoomHint}>بزرگ‌نمایی تصویر ↗</span></button>
 <dialog ref={dialog} className={styles.imageDialog} aria-label={`تصویر ${name}`} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close();}}><button type="button" className={styles.closeImage} onClick={()=>dialog.current?.close()}>بستن ×</button><img src={src} alt={name}/></dialog></div>;
}
