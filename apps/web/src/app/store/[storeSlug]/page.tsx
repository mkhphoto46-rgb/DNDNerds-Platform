import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getMarketplaceStore,getMarketplaceCatalog} from '@/lib/marketplace-api';
import {categoryLabel} from '@/lib/marketplace-labels';
import {ProductCards} from '@/components/marketplace/ProductCards';
import {StoreCommunity} from '@/components/marketplace/store-community';
import styles from '@/components/marketplace/storefront.module.css';
import formStyles from '../marketplace.module.css';
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{storeSlug:string}>}){const {storeSlug}=await params;const s=await getMarketplaceStore(storeSlug);return {title:s?.name??'فروشگاه',description:s?.description};}
export default async function StorePage({params,searchParams}:{params:Promise<{storeSlug:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {storeSlug}=await params;const raw=await searchParams;const store=await getMarketplaceStore(storeSlug);if(!store)notFound();
 const page=Math.min(400,Math.max(1,Math.floor(Number(raw.page)||1)));const query=typeof raw.q==='string'?raw.q.slice(0,100):'';const category=typeof raw.category==='string'?raw.category.slice(0,120):'';
 const catalog=await getMarketplaceCatalog({store:storeSlug,page:String(page),limit:'12',q:query,category});
 const next=(n:number)=>`/store/${storeSlug}?${new URLSearchParams({...(query?{q:query}:{}),...(category?{category}:{}),page:String(n)})}`;
 return <main className={styles.page}><div className={styles.shell}><nav className={styles.breadcrumb} aria-label="مسیر فروشگاه"><Link href="/store">بازارچه</Link><span aria-hidden="true">/</span><span>{store.name}</span></nav>
 <section className={styles.shopHero}><div><span className={styles.category}>{categoryLabel(store.category)}</span><h1>{store.name}{store.verified?' ✓':''}</h1>{store.description&&<p>{store.description}</p>}<div className={styles.shopStats}><span>{catalog.pagination.total.toLocaleString('fa-IR')} محصول{query||category?' در این جست‌وجو':''}</span><span>ارسال توسط فروشگاه</span><span>{store.reviewCount>0?`${store.rating.toLocaleString('fa-IR')} از ۵ · ${store.reviewCount.toLocaleString('fa-IR')} نظر`:'هنوز امتیازی ثبت نشده است'}</span></div></div><div className={styles.shopLinks}><a href="#shop-products">دیدن محصولات</a><a href="#shop-community">دربارهٔ فروشگاه و نظرات</a></div></section>
 <section id="shop-products"><div className={styles.sectionHeading}><h2>محصولات فروشگاه</h2></div><form className={formStyles.marketFilters} method="GET"><label>جست‌وجو در {store.name}<input name="q" defaultValue={query} maxLength={100} placeholder="نام محصول…"/></label><label>دسته‌بندی<select name="category" defaultValue={category}><option value="">همهٔ دسته‌ها</option>{['dice','miniatures','clothing','accessories','books'].map(c=><option value={c} key={c}>{categoryLabel(c)}</option>)}</select></label><button type="submit">نمایش محصولات</button>{(query||category)&&<Link href={`/store/${storeSlug}`}>پاک‌کردن فیلتر</Link>}</form>
 <div style={{marginTop:24}}>{catalog.data.length?<ProductCards products={catalog.data}/>:<div className={styles.empty}>محصولی با این مشخصات پیدا نشد.</div>}</div><nav className={styles.pagination} aria-label="صفحه‌بندی محصولات فروشگاه">{page>1&&<Link href={next(page-1)}>صفحهٔ قبل</Link>}<span>صفحهٔ {page.toLocaleString('fa-IR')}</span>{page*12<catalog.pagination.total&&<Link href={next(page+1)}>صفحهٔ بعد</Link>}</nav></section>
 <div id="shop-community"><StoreCommunity storeId={store.id}/></div>
 </div></main>;
}
