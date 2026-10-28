import Link from "next/link";
import {
  notFound,
} from "next/navigation";

import {
  AddToCartButton,
} from "@/components/marketplace/add-to-cart-button";

import {
  formatToman,
  getMarketplaceProduct,
  marketplaceTone,
} from "@/lib/marketplace-api";

import styles from "../../marketplace.module.css";

export const dynamic =
  "force-dynamic";

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
  const catalogOnly = process.env.FREE_LAUNCH_MODE === "true";

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
            <span className={styles.productGlyph}>
              ✦
            </span>
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

            <div className={styles.bigPrice}>
              {formatToman(
                product.priceToman,
              )}
            </div>

            <div className={styles.fulfillmentNotice}>
              موجودی فعلی:
              {" "}
              {product.inventory}
              <br />

              ارسال و Fulfillment این محصول
              مستقیماً توسط
              {" "}
              {product.store.name}
              {" "}
              انجام می‌شود
            </div>

            {catalogOnly ? <p className={styles.fulfillmentNotice}>این محصول فعلاً برای نمایش است. ثبت سفارش و پرداخت بعداً فعال می‌شود.</p> : <AddToCartButton
              productId={product.id}
              productSlug={product.slug}
              productName={product.name}
              storeSlug={product.store.slug}
              storeName={product.store.name}
              unitPriceToman={product.priceToman}
              inventory={product.inventory}
            />}

          </div>

        </section>

      </div>

    </main>
  );
}
