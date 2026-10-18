"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "../seller-dashboard.module.css";

type ProductStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type Product = {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  priceRial: number;
  priceToman: number;
  quantityOnHand: number;
  quantityReserved: number;
};
type SellerOrder = {
  id: string;
  status: string;
  grossToman: number;
  sellerNetToman: number;
};
type Store = {
  storeId: string;
  slug: string;
  name: string;
  status: string;
  role: string;
  verified: boolean;
  commissionBps: number;
  balance: {
    pendingToman: number;
    availableToman: number;
    negativeToman: number;
    paidOutToman: number;
  };
  products: Product[];
  orders: SellerOrder[];
};
type Dashboard = {
  seller: { id: string; displayName: string; status: string } | null;
  stores: Store[];
};
type ProductForm = {
  name: string;
  slug: string;
  description: string;
  category: string;
  sku: string;
  priceRial: string;
  stock: string;
  publish: boolean;
};

const emptyForm: ProductForm = {
  name: "", slug: "", description: "", category: "", sku: "",
  priceRial: "", stock: "", publish: false,
};
const fmt = (value: number) => new Intl.NumberFormat("fa-IR").format(value);
const toman = (value: number) => `${fmt(value)} تومان`;
const priceCheck = (value: string) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1000 || n > 2_000_000_000) {
    throw new Error("قیمت باید عدد صحیح بین ۱٬۰۰۰ تا ۲٬۰۰۰٬۰۰۰٬۰۰۰ ریال باشد.");
  }
  return n;
};
const stockCheck = (value: string, min = 0) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > 1_000_000) {
    throw new Error(`موجودی باید عدد صحیح بین ${fmt(min)} و ۱٬۰۰۰٬۰۰۰ باشد.`);
  }
  return n;
};

class AuthRequiredError extends Error {
  constructor() { super("نشست ورود معتبر نیست. برای ادامه دوباره وارد حساب شو."); }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const raw = await response.text();
  let body: { error?: { message?: string } } = {};
  try { body = JSON.parse(raw) as typeof body; } catch { /* Non-JSON API errors */ }
  if (!response.ok) {
    if (response.status === 401) throw new AuthRequiredError();
    throw new Error(body?.error?.message || `Server returned HTTP ${response.status}.`);
  }
  return body as T;
}
const jsonInit = (method: string, body: unknown): RequestInit => ({
  method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

export default function SellerDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState<"products" | "orders">("products");
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<ProductForm>({ ...emptyForm });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ priceRial: "", stock: "", status: "DRAFT" as ProductStatus });
  const [shippingId, setShippingId] = useState<string | null>(null);
  const [shipping, setShipping] = useState({ carrier: "", trackingCode: "" });

  const store = useMemo(
    () => data?.stores.find((item) => item.storeId === selectedId) || null,
    [data, selectedId],
  );
  const canProducts = store ? ["OWNER", "MANAGER", "PRODUCT_EDITOR"].includes(store.role) : false;
  const canOrders = store ? ["OWNER", "MANAGER", "ORDER_MANAGER"].includes(store.role) : false;

  async function load() {
    const result = await request<Dashboard>("/api/seller/dashboard");
    setNeedsLogin(false);
    setData(result);
    setSelectedId((current) => result.stores.some((item) => item.storeId === current)
      ? current : result.stores[0]?.storeId ?? "");
    setLoading(false);
  }

  useEffect(() => {
    void load().catch((err: unknown) => {
      if (err instanceof AuthRequiredError) { setNeedsLogin(true); setData(null); }
      setError(err instanceof Error ? err.message : "Dashboard could not load.");
      setLoading(false);
    });
  }, []);

  async function mutate(label: string, action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await action();
      await load();
      setNotice(label);
    } catch (err) {
      if (err instanceof AuthRequiredError) { setNeedsLogin(true); setData(null); }
      setError(err instanceof Error ? err.message : "Operation failed.");
    } finally { setBusy(false); }
  }

  function selectStore(id: string) {
    setSelectedId(id);
    setEditingId(null); setShippingId(null);
    setError(null); setNotice(null);
  }

  function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!store || !canProducts) return;
    const targetStoreId = store.storeId;
    void mutate("محصول با موفقیت ثبت شد.", async () => {
      if (form.publish && store.status !== "ACTIVE") {
        throw new Error("فروشگاه هنوز تأیید نشده؛ محصول را به‌صورت Draft ثبت کن.");
      }
      const priceRial = priceCheck(form.priceRial);
      const stock = stockCheck(form.stock);
      await request(`/api/seller/stores/${targetStoreId}/products`, jsonInit("POST", {
        name: form.name.trim(), slug: form.slug.trim(), description: form.description.trim(),
        category: form.category.trim(), sku: form.sku.trim(), priceRial, stock,
        publish: form.publish,
      }));
      setForm({ ...emptyForm });
    });
  }

  function beginEdit(product: Product) {
    setEditingId(product.id);
    setEdit({ priceRial: String(product.priceRial), stock: String(product.quantityOnHand), status: product.status });
    setError(null);
  }

  function saveEdit(product: Product) {
    if (!store || !canProducts) return;
    const targetStoreId = store.storeId;
    void mutate("تغییرات محصول ذخیره شد.", async () => {
      if (edit.status === "PUBLISHED" && store.status !== "ACTIVE") {
        throw new Error("انتشار محصول فقط برای فروشگاه فعال مجاز است.");
      }
      const priceRial = priceCheck(edit.priceRial);
      const stock = stockCheck(edit.stock, product.quantityReserved);
      await request(`/api/seller/stores/${targetStoreId}/products/${product.id}`,
        jsonInit("PATCH", { priceRial, stock, status: edit.status }));
      setEditingId(null);
    });
  }

  function changeOrder(order: SellerOrder, action: "PROCESSING" | "SHIP" | "DELIVER") {
    if (!store || !canOrders) return;
    const targetStoreId = store.storeId;
    if (action === "DELIVER" && !window.confirm("تحویل کالا را تأیید می‌کنی؟ این عملیات روی موجودی مالی فروشنده اثر می‌گذارد.")) return;
    void mutate("وضعیت سفارش به‌روزرسانی شد.", async () => {
      let payload: Record<string, string> = { action };
      if (action === "SHIP") {
        if (shipping.carrier.trim().length < 2 || shipping.trackingCode.trim().length < 3) {
          throw new Error("Carrier باید حداقل ۲ و کد رهگیری حداقل ۳ کاراکتر باشد.");
        }
        payload = { action, carrier: shipping.carrier.trim(), trackingCode: shipping.trackingCode.trim() };
      }
      await request(`/api/seller/stores/${targetStoreId}/orders/${order.id}/fulfillment`, jsonInit("POST", payload));
      setShippingId(null);
      setShipping({ carrier: "", trackingCode: "" });
    });
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>D&D NERDS / SELLER CENTER</p>
            <h1>مدیریت فروشگاه</h1>
            <p className={styles.meta}>محصولات، سفارش‌ها و درآمد هر فروشگاه را جداگانه مدیریت کن.</p>
          </div>
          <div className={styles.headerActions}>
            <Link className={styles.secondary} href="/seller/payouts">تسویه‌ها</Link>
            <button type="button" className={styles.secondary} disabled={busy || loading}
              onClick={() => { setError(null); setNotice(null); void load().catch((err: unknown) => { if (err instanceof AuthRequiredError) { setNeedsLogin(true); setData(null); } setError(err instanceof Error ? err.message : "Refresh failed."); }); }}>
              تازه‌سازی
            </button>
          </div>
        </header>

        {error && <div className={styles.error} role="alert">{error}</div>}
        {needsLogin && <div className={styles.notice} role="status"><Link className={styles.link} href="/login?next=%2Fseller%2Fdashboard">ورود مجدد به حساب فروشنده</Link></div>}
        {notice && <div className={styles.success} role="status">{notice}</div>}
        {loading && <div className={styles.notice}>در حال دریافت داده‌های فروشنده…</div>}
        {!loading && !data && <div className={styles.notice}>دریافت اطلاعات ناموفق بود. دکمه تازه‌سازی را بزن.</div>}
        {!loading && data && !data.seller && <div className={styles.notice}>پروفایل فروشنده نداری. <Link className={styles.link} href="/seller/register">ثبت‌نام فروشنده</Link></div>}
        {!loading && data?.seller && data.stores.length === 0 && <div className={styles.notice}>هنوز عضو فروشگاهی نیستی. <Link className={styles.link} href="/seller/register">ایجاد فروشگاه</Link></div>}

        {store && (
          <>
            <section className={styles.selector} aria-label="فروشگاه فعال">
              <label className={styles.field}>
                <span>فروشگاه انتخاب‌شده</span>
                <select value={store.storeId} onChange={(event) => selectStore(event.target.value)} disabled={busy}>
                  {data?.stores.map((item) => <option key={item.storeId} value={item.storeId}>{item.name} — {item.status}</option>)}
                </select>
              </label>
              <div>
                <strong>{store.name}</strong>
                <p className={styles.meta} dir="ltr">{store.slug} · {store.status} · {store.role}</p>
              </div>
              {store.status !== "ACTIVE" && <span className={styles.warning}>فروشگاه هنوز فعال نیست؛ انتشار محصول محدود است.</span>}
            </section>

            <section className={styles.stats} aria-label="آمار فروشگاه">
              <div className={styles.stat}><small>در انتظار تسویه</small><strong>{toman(store.balance.pendingToman)}</strong></div>
              <div className={styles.stat}><small>قابل برداشت</small><strong>{toman(store.balance.availableToman)}</strong></div>
              <div className={styles.stat}><small>بدهی فروشگاه</small><strong>{toman(store.balance.negativeToman)}</strong></div>
              <div className={styles.stat}><small>کمیسیون</small><strong dir="ltr">{(store.commissionBps / 100).toFixed(2)}%</strong></div>
            </section>

            <nav className={styles.tabs} aria-label="بخش‌های فروشنده">
              <button type="button" onClick={() => setTab("products")} aria-current={tab === "products" ? "page" : undefined} className={tab === "products" ? styles.tabActive : styles.tab}>محصولات ({store.products.length})</button>
              <button type="button" onClick={() => setTab("orders")} aria-current={tab === "orders" ? "page" : undefined} className={tab === "orders" ? styles.tabActive : styles.tab}>سفارش‌ها ({store.orders.length})</button>
            </nav>

            {tab === "products" && (
              <section className={styles.card}>
                <div className={styles.sectionHead}><h2>مدیریت محصولات</h2><span className={styles.meta}>موجودی رزروشده قابل کاهش نیست.</span></div>
                {store.products.length === 0 && <p className={styles.notice}>محصولی برای این فروشگاه ثبت نشده است.</p>}
                {store.products.map((product) => (
                  <article className={styles.row} key={product.id}>
                    <div className={styles.rowHead}><strong>{product.name}</strong><span className={styles.state}>{product.status}</span></div>
                    <p className={styles.meta}>{toman(product.priceToman)} · موجودی {fmt(product.quantityOnHand)} · رزرو {fmt(product.quantityReserved)}</p>
                    {editingId === product.id ? (
                      <div className={styles.form}>
                        <label className={styles.field}><span>قیمت (ریال)</span><input type="number" min="1000" max="2000000000" value={edit.priceRial} onChange={(event) => setEdit({ ...edit, priceRial: event.target.value })} /></label>
                        <label className={styles.field}><span>موجودی</span><input type="number" min={product.quantityReserved} max="1000000" value={edit.stock} onChange={(event) => setEdit({ ...edit, stock: event.target.value })} /></label>
                        <label className={styles.field}><span>وضعیت</span><select value={edit.status} onChange={(event) => setEdit({ ...edit, status: event.target.value as ProductStatus })}><option value="DRAFT">Draft</option><option value="PUBLISHED" disabled={store.status !== "ACTIVE"}>Published</option><option value="ARCHIVED">Archived</option></select></label>
                        <div className={styles.actions}><button type="button" className={styles.button} disabled={busy} onClick={() => saveEdit(product)}>ذخیره</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => setEditingId(null)}>انصراف</button></div>
                      </div>
                    ) : canProducts && <button type="button" className={styles.secondary} disabled={busy} onClick={() => beginEdit(product)}>ویرایش قیمت / موجودی / وضعیت</button>}
                  </article>
                ))}

                {canProducts && <div className={styles.addSection}>
                  <h3>افزودن محصول به «{store.name}»</h3>
                  <form className={styles.form} onSubmit={createProduct}>
                    {([ ["name", "نام محصول"], ["slug", "Slug (انگلیسی و خط تیره)"], ["category", "دسته‌بندی"], ["sku", "SKU"], ["priceRial", "قیمت (ریال)"], ["stock", "موجودی اولیه"] ] as const).map(([field, label]) => (
                      <label key={field} className={styles.field}><span>{label}</span><input required type={field === "priceRial" || field === "stock" ? "number" : "text"} min={field === "priceRial" ? 1000 : field === "stock" ? 0 : undefined} value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} /></label>
                    ))}
                    <label className={styles.wide}><span>توضیحات (حداقل ۵ کاراکتر)</span><textarea required minLength={5} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></label>
                    <label className={styles.check}><input type="checkbox" checked={form.publish} disabled={store.status !== "ACTIVE"} onChange={(event) => setForm({ ...form, publish: event.target.checked })}/> انتشار فوری (فقط فروشگاه فعال)</label>
                    <div className={styles.actions}><button className={styles.button} disabled={busy} type="submit">{busy ? "در حال ثبت…" : "ثبت محصول"}</button></div>
                  </form>
                </div>}
              </section>
            )}

            {tab === "orders" && (
              <section className={styles.card}>
                <div className={styles.sectionHead}><h2>عملیات سفارش</h2><span className={styles.meta}>هر سفارش فقط متعلق به فروشگاه انتخاب‌شده است.</span></div>
                {store.orders.length === 0 && <p className={styles.notice}>سفارشی برای این فروشگاه وجود ندارد.</p>}
                {store.orders.map((order) => (
                  <article className={styles.row} key={order.id}>
                    <div className={styles.rowHead}><strong dir="ltr">#{order.id.slice(0, 8)}</strong><span className={styles.state}>{order.status}</span></div>
                    <p className={styles.meta}>مبلغ سفارش {toman(order.grossToman)} · سهم فروشنده {toman(order.sellerNetToman)}</p>
                    {canOrders && <div className={styles.actions}>
                      {order.status === "PAID" && <button type="button" className={styles.secondary} disabled={busy} onClick={() => changeOrder(order, "PROCESSING")}>شروع پردازش</button>}
                      {(order.status === "PAID" || order.status === "PROCESSING") && <button type="button" className={styles.button} disabled={busy} onClick={() => { setShippingId(order.id); setShipping({ carrier: "", trackingCode: "" }); }}>ثبت ارسال</button>}
                      {order.status === "SHIPPED" && <button type="button" className={styles.button} disabled={busy} onClick={() => changeOrder(order, "DELIVER")}>تأیید تحویل</button>}
                    </div>}
                    {shippingId === order.id && <div className={styles.form}>
                      <label className={styles.field}><span>شرکت حمل</span><input value={shipping.carrier} onChange={(event) => setShipping({ ...shipping, carrier: event.target.value })} placeholder="Post" /></label>
                      <label className={styles.field}><span>کد رهگیری</span><input value={shipping.trackingCode} onChange={(event) => setShipping({ ...shipping, trackingCode: event.target.value })} /></label>
                      <div className={styles.actions}><button type="button" className={styles.button} disabled={busy} onClick={() => changeOrder(order, "SHIP")}>ثبت ارسال</button><button type="button" className={styles.secondary} disabled={busy} onClick={() => setShippingId(null)}>انصراف</button></div>
                    </div>}
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
