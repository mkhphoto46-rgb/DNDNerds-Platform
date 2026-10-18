"use client";

import Link from "next/link";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  clearCart,
  readCart,
  type CartItem,
} from "@/lib/cart";

import styles from "./checkout.module.css";

type MeResponse = {
  user?: {
    id: string;
    email: string;
  };
};

type CreatedOrder = {
  order: {
    id: string;
    status: string;
    customerTotalToman: number;
  };
};

type PaymentIntentResponse = {
  providerSession?: {
    provider: string;
    providerIntentId: string;
    redirectUrl: string | null;
    reused: boolean;
  };

  error?: {
    code?: string;
    message?: string;
  };
};

type CreatedState = {
  order:
    CreatedOrder["order"];

  paymentProvider:
    string | null;

  paymentMessage:
    string | null;
};

function formatToman(
  value: number,
) {
  return (
    new Intl.NumberFormat(
      "fa-IR",
    ).format(value) +
    " تومان"
  );
}

export default function CheckoutPage() {
  const [items, setItems] =
    useState<CartItem[]>([]);

  const [
    checkingAuth,
    setCheckingAuth,
  ] =
    useState(true);

  const [
    authenticated,
    setAuthenticated,
  ] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState<string | null>(
      null,
    );

  const [created, setCreated] =
    useState<CreatedState | null>(
      null,
    );

  const [form, setForm] =
    useState({
      fullName: "",
      phone: "",
      province: "",
      city: "",
      addressLine1: "",
      addressLine2: "",
      postalCode: "",
    });

  useEffect(
    () => {
      setItems(
        readCart(),
      );

      async function loadMe() {
        try {
          const response =
            await fetch(
              "/api/auth/me",
              {
                cache:
                  "no-store",
              },
            );

          const data:
            MeResponse =
            await response.json();

          setAuthenticated(
            response.ok &&
            Boolean(
              data.user,
            ),
          );
        }
        catch {
          setAuthenticated(false);
        }
        finally {
          setCheckingAuth(false);
        }
      }

      void loadMe();
    },
    [],
  );

  const localTotal =
    useMemo(
      () =>
        items.reduce(
          (
            sum,
            item,
          ) =>
            sum +
            item.unitPriceToman *
              item.quantity,
          0,
        ),
      [items],
    );

  function update(
    key:
      keyof typeof form,
    value: string,
  ) {
    setForm(
      current => ({
        ...current,
        [key]:
          value,
      }),
    );
  }

  async function startPayment(
    order:
      CreatedOrder["order"],
  ) {
    const paymentResponse =
      await fetch(
        `/api/marketplace/orders/${encodeURIComponent(
          order.id,
        )}/payment-intent`,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              idempotencyKey:
                `web-pay-${crypto.randomUUID()}`,
            }),
        },
      );

    const paymentData =
      await paymentResponse
        .json() as
        PaymentIntentResponse;

    if (!paymentResponse.ok) {
      throw new Error(
        paymentData
          ?.error
          ?.message ??
        "ایجاد درخواست پرداخت انجام نشد",
      );
    }

    const session =
      paymentData
        .providerSession;

    if (!session) {
      throw new Error(
        "اطلاعات درگاه پرداخت دریافت نشد",
      );
    }

    if (
      session.provider ===
        "zarinpal" &&
      session.redirectUrl
    ) {
      const gatewayUrl =
        new URL(
          session.redirectUrl,
        );

      if (
        gatewayUrl.protocol !==
        "https:"
      ) {
        throw new Error(
          "آدرس درگاه پرداخت امن نیست",
        );
      }

      window.location.assign(
        gatewayUrl.toString(),
      );

      return;
    }

    setCreated({
      order,

      paymentProvider:
        session.provider,

      paymentMessage:
        session.provider
          .startsWith(
            "mock",
          )
          ? "سفارش ثبت شد و Payment Intent آزمایشی ساخته شد. انتقال به درگاه واقعی عمداً انجام نشد."
          : "سفارش ثبت شد، اما درگاه آدرس انتقال برنگرداند.",
    });
  }

  async function submit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !authenticated ||
      items.length === 0
    ) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response =
        await fetch(
          "/api/marketplace/orders",
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                idempotencyKey:
                  `web-${crypto.randomUUID()}`,

                address:
                  form,

                items:
                  items.map(
                    item => ({
                      productId:
                        item.productId,

                      quantity:
                        item.quantity,
                    }),
                  ),
              }),
          },
        );

      const data =
        await response.json() as
        CreatedOrder & {
          error?: {
            message?: string;
          };
        };

      if (!response.ok) {
        throw new Error(
          data
            ?.error
            ?.message ??
          "ثبت سفارش انجام نشد",
        );
      }

      clearCart();
      setItems([]);

      setCreated({
        order:
          data.order,

        paymentProvider:
          null,

        paymentMessage:
          "سفارش ثبت شد. در حال آماده‌سازی پرداخت...",
      });

      try {
        await startPayment(
          data.order,
        );
      }
      catch (paymentReason) {
        setCreated({
          order:
            data.order,

          paymentProvider:
            null,

          paymentMessage:
            paymentReason instanceof Error
              ? paymentReason.message
              : "درخواست پرداخت ساخته نشد.",
        });
      }
    }
    catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "ثبت سفارش انجام نشد",
      );
    }
    finally {
      setLoading(false);
    }
  }

  if (created) {
    return (
      <main className={styles.page}>
        <section className={styles.success}>
          <div className={styles.eyebrow}>
            ORDER CREATED
          </div>

          <h1>
            سفارش ثبت شد
          </h1>

          <p>
            Order ID:
            {" "}
            <strong>
              {created.order.id}
            </strong>
          </p>

          <p>
            وضعیت سفارش:
            {" "}
            {created.order.status}
          </p>

          {created.paymentProvider && (
            <p>
              Payment Provider:
              {" "}
              <strong>
                {created.paymentProvider}
              </strong>
            </p>
          )}

          {created.paymentMessage && (
            <p>
              {created.paymentMessage}
            </p>
          )}

          <Link
            href={`/orders/${created.order.id}`}
          >
            مشاهده جزئیات سفارش
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.top}>
          <div className={styles.eyebrow}>
            AUTHENTICATED CHECKOUT
          </div>

          <h1>
            ثبت سفارش
          </h1>

          <p>
            قیمت و موجودی هنگام ثبت، دوباره از PostgreSQL بررسی می‌شوند.
          </p>
        </header>

        {checkingAuth ? (
          <div className={styles.notice}>
            در حال بررسی حساب...
          </div>
        ) : !authenticated ? (
          <div className={styles.notice}>
            برای ثبت سفارش ابتدا
            {" "}
            <Link href="/login">
              وارد شو
            </Link>
            {" "}
            یا
            {" "}
            <Link href="/register">
              حساب بساز
            </Link>.
          </div>
        ) : items.length === 0 ? (
          <div className={styles.notice}>
            سبد خرید خالی است.
            {" "}
            <Link href="/store">
              Marketplace
            </Link>
          </div>
        ) : (
          <form
            className={styles.grid}
            onSubmit={submit}
          >
            <section className={styles.panel}>
              <h2>
                آدرس تحویل
              </h2>

              <div className={styles.form}>
                <label className={styles.fieldWide}>
                  <span>
                    نام و نام خانوادگی
                  </span>
                  <input
                    value={form.fullName}
                    onChange={
                      event =>
                        update(
                          "fullName",
                          event.target.value,
                        )
                    }
                    required
                  />
                </label>

                <label className={styles.field}>
                  <span>
                    شماره تماس
                  </span>
                  <input
                    value={form.phone}
                    onChange={
                      event =>
                        update(
                          "phone",
                          event.target.value,
                        )
                    }
                    required
                  />
                </label>

                <label className={styles.field}>
                  <span>
                    کد پستی
                  </span>
                  <input
                    value={form.postalCode}
                    onChange={
                      event =>
                        update(
                          "postalCode",
                          event.target.value,
                        )
                    }
                    required
                  />
                </label>

                <label className={styles.field}>
                  <span>
                    استان
                  </span>
                  <input
                    value={form.province}
                    onChange={
                      event =>
                        update(
                          "province",
                          event.target.value,
                        )
                    }
                    required
                  />
                </label>

                <label className={styles.field}>
                  <span>
                    شهر
                  </span>
                  <input
                    value={form.city}
                    onChange={
                      event =>
                        update(
                          "city",
                          event.target.value,
                        )
                    }
                    required
                  />
                </label>

                <label className={styles.fieldWide}>
                  <span>
                    آدرس
                  </span>
                  <textarea
                    value={form.addressLine1}
                    onChange={
                      event =>
                        update(
                          "addressLine1",
                          event.target.value,
                        )
                    }
                    required
                  />
                </label>

                <label className={styles.fieldWide}>
                  <span>
                    توضیحات تکمیلی آدرس
                  </span>
                  <input
                    value={form.addressLine2}
                    onChange={
                      event =>
                        update(
                          "addressLine2",
                          event.target.value,
                        )
                    }
                  />
                </label>
              </div>

              {error && (
                <div className={styles.error}>
                  {error}
                </div>
              )}
            </section>

            <aside
              className={`${styles.panel} ${styles.summary}`}
            >
              <h2>
                سفارش
              </h2>

              {items.map(
                item => (
                  <div
                    className={styles.line}
                    key={item.productId}
                  >
                    <span>
                      {item.productName}
                      {" × "}
                      {item.quantity}
                    </span>

                    <strong>
                      {formatToman(
                        item.unitPriceToman *
                        item.quantity,
                      )}
                    </strong>
                  </div>
                ),
              )}

              <div className={styles.total}>
                <span>
                  جمع فعلی
                </span>

                <strong>
                  {formatToman(
                    localTotal,
                  )}
                </strong>
              </div>

              <button
                className={styles.button}
                type="submit"
                disabled={loading}
              >
                {loading
                  ? "در حال ثبت و آماده‌سازی پرداخت..."
                  : "ثبت سفارش و ادامه به پرداخت"}
              </button>
            </aside>
          </form>
        )}
      </div>
    </main>
  );
}
