import Link from "next/link";
import { notFound } from "next/navigation";

import {
  formatToman,
  getMarketplaceStore,
  marketplaceTone,
} from "@/lib/marketplace-api";

import styles from "../marketplace.module.css";

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

export default async function StorePage({
  params,
}: {
  params:
    Promise<{
      storeSlug: string;
    }>;
}) {
  const {
    storeSlug,
  } =
    await params;

  const store =
    await getMarketplaceStore(
      storeSlug,
    );

  if (!store) {
    notFound();
  }

  const storeTone =
    marketplaceTone(
      store.slug,
    );

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.detailTop}>
          <Link
            className={styles.backLink}
            href="/store"
          >
            ← Marketplace
          </Link>
        </div>

        <section
          className={`${styles.storeHero} ${toneClass(storeTone)}`}
        >
          <div className={styles.eyebrow}>
            {store.verified
              ? "VERIFIED SELLER"
              : "INDEPENDENT SELLER"}
          </div>

          <h1>
            {store.name}
          </h1>

          <p>
            {store.description}
          </p>

          <div className={styles.storeStats}>
            <span className={styles.stat}>
              ★ {store.rating}
            </span>

            <span className={styles.stat}>
              {store.reviewCount} Review
            </span>

            <span className={styles.stat}>
              {store.products.length} Product
            </span>

            <span className={styles.stat}>
              ارسال توسط فروشنده
            </span>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>
              محصولات فروشگاه
            </h2>

            <p>
              موجودی، قیمت‌گذاری و ارسال
              توسط خود فروشنده مدیریت می‌شود
            </p>
          </div>

          <div className={styles.productGrid}>
            {store.products.map(
              (product) => {
                const productTone =
                  marketplaceTone(
                    `${store.slug}:${product.slug}`,
                  );

                return (
                  <Link
                    key={product.id}
                    href={`/store/${store.slug}/${product.slug}`}
                    className={`${styles.productCard} ${toneClass(productTone)}`}
                  >
                    <div className={styles.productArt}>
                      <span className={styles.productGlyph}>
                        ✦
                      </span>
                    </div>

                    <div className={styles.productBody}>
                      <small>
                        {product.category}
                      </small>

                      <h3>
                        {product.name}
                      </h3>

                      <p>
                        {product.description}
                      </p>

                      <div className={styles.productFooter}>
                        <strong className={styles.productPrice}>
                          {formatToman(
                            product.priceToman,
                          )}
                        </strong>

                        <span className={styles.productStock}>
                          {product.inventory} موجود
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              },
            )}
          </div>
        </section>
      </div>
    </main>
  );
}