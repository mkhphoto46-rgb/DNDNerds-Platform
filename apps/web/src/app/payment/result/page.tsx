import {
  Suspense,
} from "react";

import {
  PaymentResultClient,
} from "./payment-result-client";

import styles from "./payment-result.module.css";

export default function PaymentResultPage() {
  return (
    <main className={styles.page}>
      <Suspense
        fallback={
          <section className={styles.card}>
            <div className={styles.eyebrow}>
              PAYMENT RESULT
            </div>
            <h1>
              در حال بررسی نتیجه پرداخت...
            </h1>
          </section>
        }
      >
        <PaymentResultClient />
      </Suspense>
    </main>
  );
}
