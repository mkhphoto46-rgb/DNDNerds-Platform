import Link from 'next/link';
import {notFound} from 'next/navigation';
import {CustomRequest} from '@/components/marketplace/custom-request';
import {ProductOptions} from '@/components/marketplace/product-options';
import {ProductGallery} from '@/components/marketplace/ProductGallery';
import {ProductCommunity} from '@/components/marketplace/ProductCommunity';
import {ProductCards} from '@/components/marketplace/ProductCards';
import {getMarketplaceProduct,getProductPresentation,formatToman} from '@/lib/marketplace-api';
import {categoryLabel,attributeLabel,supplyLabel} from '@/lib/marketplace-labels';
import styles from '@/components/marketplace/storefront.module.css';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{storeSlug:string;productSlug:string}>}){
 const {storeSlug,productSlug}=await params;const p=await getMarketplaceProduct(storeSlug,productSlug);if(!p)return {title:'محصول یافت نشد'};
 const url=`https://dndnerds.ir/store/${encodeURIComponent(storeSlug)}/${encodeURIComponent(productSlug)}`;
 return {title:p.name,description:p.description,alternates:{canonical:url},openGraph:{title:p.name,description:p.description,url,type:'website',...(p.imageUrl?{images:[new URL(p.imageUrl,'https://dndnerds.ir').href]}:{})}};
}
export default async function ProductPage({params}:{params:Promise<{storeSlug:string;productSlug:string}>}){
 const {storeSlug,productSlug}=await params;const product=await getMarketplaceProduct(storeSlug,productSlug);if(!product)notFound();
 const presentation=await getProductPresentation(product.id).catch(()=>null);
 const store=presentation?.store??{...product.store,description:'',category:product.category,productCount:0,rating:0,reviewCount:0};
 const attributes=new Map<string,Set<string>>();for(const v of product.variants)for(const [key,value] of Object.entries(v.options)){if(!attributes.has(key))attributes.set(key,new Set());attributes.get(key)!.add(value);}
 const catalogOnly=process.env.NODE_ENV==='production'||process.env.FREE_LAUNCH_MODE==='true';
 return <main className={styles.page}><div className={styles.shell}>
  <nav className={styles.breadcrumb} aria-label="مسیر محصول"><Link href="/store">بازارچه</Link><span aria-hidden="true">/</span><Link href={`/store?category=${encodeURIComponent(product.category)}`}>{categoryLabel(product.category)}</Link><span aria-hidden="true">/</span><Link href={`/store/${store.slug}`}>{store.name}</Link><span aria-hidden="true">/</span><span>{product.name}</span></nav>
  <section className={styles.productLayout} aria-label="معرفی و انتخاب محصول">
   <ProductGallery src={product.imageUrl} name={product.name}/>
   <div className={styles.overview}><Link className={styles.category} href={`/store?category=${encodeURIComponent(product.category)}`}>{categoryLabel(product.category)}</Link><h1 className={styles.productTitle}>{product.name}</h1><div className={styles.overviewLinks}><a href="#product-community">دیدگاه‌ها و پرسش‌ها</a><Link href={`/store/${store.slug}`}>از فروشگاه {store.name}</Link></div><p className={styles.summary}>{product.description}</p>
    <dl className={styles.facts}>{product.brand&&<div><dt>برند</dt><dd><bdi>{product.brand}</bdi></dd></div>}<div><dt>نوع عرضه</dt><dd>{supplyLabel(product.productType)}</dd></div>{Array.from(attributes).slice(0,4).map(([key,values])=><div key={key}><dt>{attributeLabel(key)}</dt><dd>{Array.from(values).join('، ')}</dd></div>)}</dl>
   </div>
   <aside className={styles.purchaseCard} aria-label="فروشگاه و انتخاب کالا"><Link className={styles.shopIdentity} href={`/store/${store.slug}`}><span className={styles.shopAvatar} aria-hidden="true">{store.name.slice(0,1)}</span><div><strong>{store.name}{store.verified?' ✓':''}</strong><small>{categoryLabel(store.category)}{store.productCount>0?` · ${store.productCount.toLocaleString('fa-IR')} محصول`:''}</small></div><span aria-hidden="true">←</span></Link>
    <div className={styles.serviceList}><div><span className={styles.serviceIcon} aria-hidden="true">♧</span><div><strong>ارسال توسط فروشگاه</strong><p>{presentation?.shipping?`${presentation.shipping.method} · ${formatToman(presentation.shipping.feeRial/10)} · آماده‌سازی ${presentation.shipping.dispatchDays.toLocaleString('fa-IR')} روز`:'جزئیات ارسال را از فروشگاه بپرسید.'}</p></div></div><div><span className={styles.serviceIcon} aria-hidden="true">↶</span><div><strong>راهنمای خرید و مرجوعی</strong><p><Link href="/store/policies">مشاهدهٔ شرایط فروشگاه و خدمات بازارچه</Link></p></div></div></div>
    <ProductOptions product={product} catalogOnly={catalogOnly}/><a href="#product-community" className={styles.sellerQuestion}>پرسش دربارهٔ محصول</a>
   </aside>
  </section>
  <nav className={styles.sectionNav} aria-label="بخش‌های محصول"><a href="#product-introduction">معرفی محصول</a><a href="#product-specifications">مشخصات</a><a href="#product-community">نظرات و پرسش‌ها</a><a href="#similar-products">محصولات مشابه</a><a href="#seller-introduction">دربارهٔ فروشگاه</a></nav>
  <section className={styles.contentPanel} id="product-introduction"><h2>معرفی محصول</h2><p className={styles.description}>{product.description}</p></section>
  <section className={styles.contentPanel} id="product-specifications"><h2>مشخصات محصول</h2><dl className={styles.specGrid}><div><dt>دسته‌بندی</dt><dd>{categoryLabel(product.category)}</dd></div>{product.brand&&<div><dt>برند</dt><dd><bdi>{product.brand}</bdi></dd></div>}<div><dt>نوع عرضه</dt><dd>{supplyLabel(product.productType)}</dd></div>{product.productionDays>0&&<div><dt>آماده‌سازی</dt><dd>{product.productionDays.toLocaleString('fa-IR')} روز</dd></div>}{Array.from(attributes).map(([key,values])=><div key={key}><dt>{attributeLabel(key)}</dt><dd>{Array.from(values).join('، ')}</dd></div>)}</dl></section>
  {product.productType==='CUSTOM_DESIGN'&&<section className={styles.contentPanel}><h2>درخواست ساخت اختصاصی</h2><CustomRequest storeId={store.id}/></section>}
  <ProductCommunity productId={product.id} productName={product.name}/>
  <section className={styles.section} id="similar-products"><div className={styles.sectionHeading}><h2>محصولات مشابه</h2><Link href={`/store/${store.slug}`}>همهٔ محصولات {store.name} ←</Link></div>{presentation?.related.length?<ProductCards products={presentation.related}/>:<div className={styles.empty}>محصول مشابه دیگری برای نمایش نیست. <Link href={`/store?category=${encodeURIComponent(product.category)}`}>مشاهدهٔ {categoryLabel(product.category)} ←</Link></div>}</section>
  <section className={styles.contentPanel} id="seller-introduction"><div className={styles.sectionHeading}><h2>از فروشگاه {store.name}</h2><Link href={`/store/${store.slug}`}>مشاهدهٔ فروشگاه ←</Link></div>{store.description?<p className={styles.description}>{store.description}</p>:<p className={styles.description}>محصولات {store.name} را در صفحهٔ اختصاصی این فروشگاه ببینید.</p>}</section>
 </div></main>;
}
