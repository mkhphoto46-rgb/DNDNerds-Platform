import Link from "next/link";

import {
  formatToman,
  getMarketplaceProducts,
  getMarketplaceStores,
  marketplaceTone,
} from "@/lib/marketplace-api";

import styles from "./marketplace.module.css";

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

export default async function MarketplacePage() {
  const catalogOnly = process.env.FREE_LAUNCH_MODE === "true";
  const [
    marketplaceStores,
    marketplaceProducts,
  ] =
    await Promise.all([
      getMarketplaceStores(),
      getMarketplaceProducts(),
    ]);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <div className={styles.eyebrow}>
              DND NERDS MARKETPLACE
            </div>

            <h1 className={styles.heroTitle}>
              بازار مستقل
              <span>
                برای دنیای TTRPG
              </span>
            </h1>

            <p className={styles.heroText}>
              {catalogOnly
                ? "کاتالوگ بازارچه را ببین. ثبت سفارش و پرداخت پس از اتصال درگاه فعال می‌شود."
                : "فروشگاه‌های مستقل، سازندگان و هنرمندان می‌توانند محصولات خودشان را عرضه کنند، سفارش بگیرند و ارسال را مستقیماً مدیریت کنند."}
            </p>

            <div className={styles.heroActions}>
              <a
                className={styles.primaryButton}
                href="#stores"
              >
                دیدن فروشگاه‌ها
              </a>

              {!catalogOnly && <Link
                className={styles.secondaryButton}
                href="/seller/register"
              >
                ساخت فروشگاه
              </Link>}
            </div>
          </div>

          <div
            className={styles.heroVisual}
            aria-hidden="true"
          >
            <div className={styles.heroRing} />

            <div
              className={`${styles.visualCard} ${styles.visualCardOne}`}
            >
              <span>
                VERIFIED STORE
              </span>
              <strong>
                Dragon Forge
              </strong>
            </div>

            <div
              className={`${styles.visualCard} ${styles.visualCardTwo}`}
            >
              <span>
                SELLER FULFILLMENT
              </span>
              <strong>
                Independent Shipping
              </strong>
            </div>

            <div
              className={`${styles.visualCard} ${styles.visualCardThree}`}
            >
              <span>
                MARKETPLACE
              </span>
              <strong>
                Multi-Vendor
              </strong>
            </div>
          </div>
        </section>

        <section
          className={styles.section}
          id="stores"
        >
          <div className={styles.sectionHead}>
            <h2>
              فروشگاه‌ها
            </h2>

            <p>
              هر فروشگاه مستقل است،
              محصولات و موجودی خودش را
              مدیریت می‌کند و مسئول ارسال
              سفارش‌های خودش است
            </p>
          </div>

          <div className={styles.storeGrid}>
            {marketplaceStores.map(
              (store) => {
                const tone =
                  marketplaceTone(
                    store.slug,
                  );

                return (
                  <Link
                    key={store.id}
                    href={`/store/${store.slug}`}
                    className={`${styles.storeCard} ${toneClass(tone)}`}
                  >
                    <div className={styles.storeTop}>
                      <div className={styles.storeMark}>
                        {store.name
                          .split(" ")
                          .map(
                            (part) =>
                              part[0],
                          )
                          .join("")
                          .slice(
                            0,
                            2,
                          )}
                      </div>

                      {store.verified && (
                        <span className={styles.verified}>
                          VERIFIED
                        </span>
                      )}
                    </div>

                    <div className={styles.storeBody}>
                      <small>
                        {store.category}
                      </small>

                      <h3>
                        {store.name}
                      </h3>

                      <p>
                        {store.description}
                      </p>

                      <div className={styles.storeMeta}>
                        <span>
                          ★ {store.rating}
                        </span>

                        <span>
                          {store.productCount} محصول
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              },
            )}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>
              محصولات منتخب
            </h2>

            <p>
              قیمت، موجودی و اطلاعات محصولات
              مستقیماً از Marketplace Database
              خوانده می‌شود
            </p>
          </div>

          <div className={styles.productGrid}>
            {marketplaceProducts.map(
              (product) => {
                const tone =
                  marketplaceTone(
                    `${product.store.slug}:${product.slug}`,
                  );

                return (
                  <Link
                    key={product.id}
                    href={`/store/${product.store.slug}/${product.slug}`}
                    className={`${styles.productCard} ${toneClass(tone)}`}
                  >
                    <div className={styles.productArt}>
                      <span className={styles.productGlyph}>
                        ✦
                      </span>
                    </div>

                    <div className={styles.productBody}>
                      <small>
                        {product.store.name}
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

        {!catalogOnly && <section className={styles.sellerBanner}>
          <div className={styles.sellerBannerText}>
            <div className={styles.eyebrow}>
              SELL ON DND NERDS
            </div>

            <h2>
              فروشگاه خودت را بساز
            </h2>

            <p>
              محصول اضافه کن، قیمت و موجودی
              را مدیریت کن، سفارش بگیر و
              ارسال را خودت انجام بده
            </p>
          </div>

          <Link
            className={styles.primaryButton}
            href="/seller/register"
          >
            شروع ثبت فروشگاه
          </Link>
        </section>}
      </div>
    </main>
  );
}
