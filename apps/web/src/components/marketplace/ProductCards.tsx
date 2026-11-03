import Link from 'next/link';
import type {MarketplaceProduct} from '@/lib/marketplace-api';
import {formatToman} from '@/lib/marketplace-api';
import {categoryLabel} from '@/lib/marketplace-labels';
import styles from './storefront.module.css';
export function ProductCards({products}:{products:MarketplaceProduct[]}){
 return <div className={styles.cards}>{products.map(p=><Link key={p.id} className={styles.card} href={`/store/${p.store.slug}/${p.slug}`}><div className={styles.cardArt}>{p.imageUrl?<img src={p.imageUrl} alt={p.name} loading="lazy"/>:<span aria-hidden="true">✦</span>}</div><div className={styles.cardBody}><small>{p.store.name} · {categoryLabel(p.category)}</small><h3>{p.name}</h3><div className={styles.cardFooter}><strong>{formatToman(p.priceToman)}</strong><span>{p.inventory>0?(p.productType==='READY_TO_SHIP'?'موجود':'ظرفیت ساخت دارد'):'ناموجود'}</span></div></div></Link>)}</div>;
}
