import Link from 'next/link';
import {formatToman,type MarketplaceProduct} from '@/lib/marketplace-api';
import {categoryLabel} from '@/lib/marketplace-labels';
import {productDiscount} from '@/lib/product-discount';
import styles from '@/app/store/marketplace.module.css';
export function MarketProductCard({product:p}:{product:MarketplaceProduct}){
 const discount=productDiscount(p);
 const original=p.variants.find(v=>v.priceRial===p.priceRial&&v.basePriceRial>v.priceRial)?.basePriceRial;
 return <Link href={`/store/${p.store.slug}/${p.slug}`} className={styles.productCard}><div className={styles.productArt} aria-hidden="true">{p.imageUrl?<img src={p.imageUrl} alt="" loading="lazy" style={{width:'100%',height:'100%',objectFit:'contain'}}/>:<span className={styles.productGlyph}>✦</span>}{discount>0&&<span className={styles.discountBadge}>{discount.toLocaleString('fa-IR')}٪ تخفیف</span>}</div><div className={styles.productBody}><small>{p.store.name} · {categoryLabel(p.category)}</small><h3>{p.name}</h3><p>{p.description}</p>{original&&<p><del>{formatToman(original/10)}</del><span className={styles.discountText}> تخفیف فعال</span></p>}<div className={styles.productFooter}><strong>{formatToman(p.priceToman)}</strong><span>{p.inventory>0?(p.productType==='MADE_TO_ORDER'?'ظرفیت ساخت دارد':'موجود'):'ناموجود'}</span></div></div></Link>;
}
