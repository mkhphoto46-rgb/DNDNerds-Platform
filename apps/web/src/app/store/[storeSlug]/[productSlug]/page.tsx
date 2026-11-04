import { CustomRequest } from "@/components/marketplace/custom-request";
import { ProductOptions } from "@/components/marketplace/product-options";
import Link from "next/link";
import {
  notFound,
} from "next/navigation";



import {
  getMarketplaceProduct,
  marketplaceTone,
} from "@/lib/marketplace-api";

import styles from "../../marketplace.module.css";

export const dynamic =
  "force-dynamic";
export async function generateMetadata({params}:{params:Promise<{storeSlug:string;productSlug:string}>}){
 const {storeSlug,productSlug}=await params;const p=await getMarketplaceProduct(storeSlug,productSlug);if(!p)return {title:'محصول یافت نشد'};
 const url=`https://dndnerds.ir/store/${encodeURIComponent(storeSlug)}/${encodeURIComponent(productSlug)}`;
 return {title:p.name,description:p.description,alternates:{canonical:url},openGraph:{title:p.name,description:p.description,url,type:'website',...(p.imageUrl?{images:[new URL(p.imageUrl,'https://dndnerds.ir').href]}:{})}};
}


function toneClass(
  tone: string,
) {
  return (
    styles[
      `tone_${tone}`
    ] ?? ""
  );
}

export default async function ProductPage({
  params,
}: {
  params:
    Promise<{
      storeSlug: string;
      productSlug: string;
    }>;
}) {
  const {
    storeSlug,
    productSlug,
  } =
    await params;

  const product =
    await getMarketplaceProduct(
      storeSlug,
      productSlug,
    );

  if (!product) {
    notFound();
  }

  const tone =
    marketplaceTone(
      `${product.store.slug}:${product.slug}`,
    );
  const catalogOnly = process.env.NODE_ENV === "production" || process.env.FREE_LAUNCH_MODE === "true";

  return (
    <main className={styles.page}>

      <div className={styles.shell}>

        <div className={styles.detailTop}>

          <Link
            className={styles.backLink}
            href={`/store/${product.store.slug}`}
          >
            ← {product.store.name}
          </Link>

          {!catalogOnly && <Link
            className={styles.backLink}
            href="/cart"
          >
            سبد خرید
          </Link>}

        </div>

        <section className={styles.productDetail}>

          <div
            className={`${styles.productArt} ${styles.productDetailArt} ${toneClass(tone)}`}
          >
            {product.imageUrl ? <img src={product.imageUrl} alt={product.name} style={{width:"100%",height:"100%",objectFit:"contain"}}/> : <span className={styles.productGlyph}>✦</span>}
          </div>

          <div className={styles.productDetailCopy}>

            <div className={styles.eyebrow}>
              {product.store.name}
              {" · "}
              {product.category}
            </div>

            <h1>
              {product.name}
            </h1>

            <p className={styles.productDescription}>
              {product.description}
            </p>

            <ProductOptions product={product} catalogOnly={catalogOnly} />
            {product.productType === "CUSTOM_DESIGN" && <CustomRequest storeId={product.store.id} />}

          </div>

        </section>

      </div>

    </main>
  );
}
