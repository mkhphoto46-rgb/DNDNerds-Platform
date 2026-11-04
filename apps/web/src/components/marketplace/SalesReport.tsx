'use client';

import { useEffect, useState, type FormEvent } from 'react';
import styles from './sales-report.module.css';

type Sale = {
  id: string; orderId: string; storeId: string; storeName: string; buyerId: string | null;
  buyerName: string | null; buyerEmail: string | null; createdAt: string; paidAt: string | null;
  shippedAt: string | null; deliveredAt: string | null; fulfillmentStatus: string; paymentStatus: string;
  merchandiseRial: string; shippingRial: string | null; commissionReversalRial: string; sellerNetReversalRial: string; grossRial: string; commissionRial: string; sellerNetRial: string; refundedRial: string;
  netPaidRial: string; reconciliationMismatch: boolean;
  items: Array<{ id: string; productId: string; name: string; variantName: string | null; quantity: number; unitPriceRial: string; lineTotalRial: string }>;
};
type Report = {
  data: Sale[]; nextCursor: string | null; stores: Array<{ id: string; name: string }>;
  summary: { orderCount: number; paidRial: string; pendingRial: string; refundedRial: string;
    netPaidRial: string; commissionRial: string; sellerNetRial: string; mismatchCount: number };
};
const labels: Record<string, string> = {
  SUCCEEDED: 'موفق', PAID: 'پرداخت‌شده', PENDING_PAYMENT: 'در انتظار پرداخت', PENDING: 'در انتظار', REFUNDED: 'بازپرداخت‌شده', PARTIALLY_REFUNDED: 'بازپرداخت جزئی',
  FAILED: 'ناموفق', CANCELLED: 'لغوشده', CANCELED: 'لغوشده', NO_PAYMENT: 'بدون پرداخت ثبت‌شده',
  CREATED: 'ایجادشده', PROCESSING: 'در حال آماده‌سازی', CONFIRMED: 'تأییدشده', SHIPPED: 'ارسال‌شده', DELIVERED: 'تحویل‌شده',
};
const digits = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });
/** Keep all money arithmetic exact, including amounts smaller than one toman. */
export function formatSalesMoney(rial: string): string {
  const amount = BigInt(rial), negative = amount < BigInt(0), absolute = negative ? -amount : amount;
  const whole = absolute / BigInt(10), remainder = absolute % BigInt(10);
  return `${negative ? '−' : ''}${digits.format(whole)}${remainder ? `٫${digits.format(remainder)}` : ''} تومان`;
}
const dateFormat = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
function date(value: string | null) { return value ? dateFormat.format(new Date(value)) : 'ثبت نشده'; }

export function SalesReport({ scope }: { scope: 'admin' | 'seller' }) {
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);
  const [query, setQuery] = useState(''), [cursor, setCursor] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<string | null>>([]);
  const [report, setReport] = useState<Report | null>(null), [error, setError] = useState('');
  const [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setReport(null);
    const params = new URLSearchParams(query); params.set('limit', '25');
    if (cursor) params.set('cursor', cursor);
    const endpoint = scope === 'admin' ? '/api/admin/marketplace/sales' : '/api/marketplace/v21/seller/sales';
    void (async () => {
      try {
        const response = await fetch(`${endpoint}?${params}`, { cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message || 'دریافت گزارش فروش انجام نشد.');
        if (!Array.isArray(body.data) || !body.summary) throw new Error('پاسخ گزارش معتبر نیست.');
        if (!controller.signal.aborted) { setReport(body as Report); setStores(body.stores || []); }
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'دریافت گزارش فروش انجام نشد.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [scope, query, cursor, retry]);

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget), params = new URLSearchParams();
    for (const key of ['q', 'storeId', 'paymentStatus', 'fulfillmentStatus']) {
      const value = String(form.get(key) || '').trim(); if (value) params.set(key, value);
    }
    // Native date fields use Gregorian dates; boundaries are explicitly Tehran time.
    const from = String(form.get('from') || ''), to = String(form.get('to') || '');
    if (from && to && from > to) { setError('تاریخ پایان باید پس از تاریخ شروع باشد.'); return; }
    if (from) params.set('from', new Date(`${from}T00:00:00+03:30`).toISOString());
    if (to) params.set('to', new Date(new Date(`${to}T00:00:00+03:30`).getTime() + 86400000).toISOString());
    setCursor(null); setHistory([]); setQuery(params.toString()); setRetry(value => value + 1);
  }
  return <section id="seller-sales" className={styles.report} dir="rtl" aria-label="گزارش فروش">
    <header><h2>{scope === 'admin' ? 'گزارش جامع فروش بازارچه' : 'گزارش فروش فروشگاه‌های من'}</h2>
      <p>مبالغ به تومان؛ زمان‌ها به تقویم شمسی و ساعت تهران با دقت ثانیه نمایش داده می‌شوند. هر ردیف، سهم یک فروشگاه از یک سفارش است.</p>
      <p>وضعیت پرداخت از وضعیت آماده‌سازی و تحویل جداست. پرداخت ثبت‌شده به معنی تسویه با فروشنده نیست.</p>
    </header>
    <form className={styles.filters} onSubmit={filter}>
      <label>جست‌وجوی سفارش، خریدار یا کالا<input name="q" maxLength={160} type="search" /></label>
      <label>فروشگاه<select name="storeId"><option value="">همهٔ فروشگاه‌های مجاز</option>{stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      <label>از تاریخ (میلادی)<input name="from" type="date" /></label>
      <label>تا تاریخ (میلادی، شامل این روز)<input name="to" type="date" /></label>
      <label>وضعیت پرداخت<select name="paymentStatus"><option value="">همه</option>{['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'NO_PAYMENT'].map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
      <label>وضعیت تحویل<select name="fulfillmentStatus"><option value="">همه</option>{['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'].map(value => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
      <button className="site-primary" disabled={loading}>اعمال فیلترها</button>
      <button type="reset" className="site-secondary" disabled={loading} onClick={() => { setQuery(''); setCursor(null); setHistory([]); setRetry(value => value + 1); }}>پاک‌کردن فیلترها</button>
    </form>
    {loading && <p role="status">در حال دریافت گزارش فروش…</p>}
    {error && <div className={styles.error} role="alert"><p>{error}</p><button className="site-secondary" onClick={() => setRetry(value => value + 1)}>تلاش دوباره</button></div>}
    {!loading && !error && report && <>
      <p className={styles.note}>جمع‌های زیر مربوط به تمام ردیف‌های مطابق فیلتر هستند، نه فقط این صفحه.</p>
      <div className={styles.totals}>
        <Summary label="تعداد سفارش فروشگاه" value={digits.format(report.summary.orderCount)} />
        <Summary label="پرداخت ثبت‌شده" value={formatSalesMoney(report.summary.paidRial)} />
        <Summary label="در انتظار پرداخت" value={formatSalesMoney(report.summary.pendingRial)} />
        <Summary label="بازپرداخت‌شده" value={formatSalesMoney(report.summary.refundedRial)} />
        <Summary label="خالص پرداخت پس از بازپرداخت" value={formatSalesMoney(report.summary.netPaidRial)} />
        <Summary label="خالص کارمزد پس از بازپرداخت" value={formatSalesMoney(report.summary.commissionRial)} />
        <Summary label="خالص سهم فروشنده پس از بازپرداخت" value={formatSalesMoney(report.summary.sellerNetRial)} />
      </div>
      {report.summary.mismatchCount > 0 && <p className={styles.warning}>نیازمند بررسی تطبیق مبالغ: {digits.format(report.summary.mismatchCount)} ردیف. مبلغ سفارش و سوابق پرداخت ممکن است یکسان نباشند.</p>}
      {report.data.length === 0 ? <p className={styles.empty}>فروشی با این فیلترها ثبت نشده است.</p> : <div className={styles.rows}>{report.data.map(sale => <article className={styles.sale} key={sale.id}>
        <div className={styles.rowHeading}><h3>{sale.storeName}</h3><strong>{formatSalesMoney(sale.grossRial)}</strong></div>
        <dl className={styles.facts}>
          <Fact label="خریدار" value={sale.buyerName || 'نام ثبت نشده'} />
          <Fact label="زمان سفارش" value={date(sale.createdAt)} />
          <Fact label="پرداخت" value={labels[sale.paymentStatus] || sale.paymentStatus} />
          <Fact label="آماده‌سازی / تحویل" value={labels[sale.fulfillmentStatus] || sale.fulfillmentStatus} />
        </dl>
        <details><summary>جزئیات سفارش و اقلام ({digits.format(sale.items.length)})</summary>
          <dl className={styles.facts}>
            <Fact label="شناسهٔ سفارش اصلی" value={sale.orderId} /><Fact label="شناسهٔ سفارش فروشگاه" value={sale.id} />
            <Fact label="شناسهٔ فروشگاه" value={sale.storeId} /><Fact label="شناسهٔ خریدار" value={sale.buyerId || 'ثبت نشده'} />
            <Fact label="ایمیل خریدار" value={sale.buyerEmail || 'ثبت نشده'} />
            <Fact label="زمان پرداخت" value={date(sale.paidAt)} /><Fact label="زمان ارسال" value={date(sale.shippedAt)} /><Fact label="زمان تحویل" value={date(sale.deliveredAt)} />
            <Fact label="جمع اقلام" value={formatSalesMoney(sale.merchandiseRial)} /><Fact label="هزینهٔ ارسال" value={sale.shippingRial === null ? 'در سوابق سفارش ثبت نشده' : formatSalesMoney(sale.shippingRial)} />
            <Fact label="کارمزد سفارش" value={formatSalesMoney(sale.commissionRial)} /><Fact label="سهم فروشنده" value={formatSalesMoney(sale.sellerNetRial)} />
            <Fact label="برگشت کارمزد" value={formatSalesMoney(sale.commissionReversalRial)} /><Fact label="برگشت سهم فروشنده" value={formatSalesMoney(sale.sellerNetReversalRial)} />
            <Fact label="بازپرداخت" value={formatSalesMoney(sale.refundedRial)} /><Fact label="خالص پرداخت" value={formatSalesMoney(sale.netPaidRial)} />
          </dl>
          {sale.reconciliationMismatch && <p className={styles.warning}>این سفارش نیازمند بررسی تطبیق مالی است.</p>}
          <div className={styles.tableScroll}><table><caption>اقلام سفارش در زمان خرید</caption><thead><tr><th>کالا / نوع</th><th>تعداد</th><th>قیمت واحد</th><th>جمع ردیف</th></tr></thead><tbody>{sale.items.map(item => <tr key={item.id}><td>{item.name}{item.variantName && <small>{item.variantName}</small>}</td><td>{digits.format(item.quantity)}</td><td>{formatSalesMoney(item.unitPriceRial)}</td><td>{formatSalesMoney(item.lineTotalRial)}</td></tr>)}</tbody></table></div>
        </details>
      </article>)}</div>}
      <nav className={styles.pagination} aria-label="صفحه‌های گزارش فروش">
        <button className="site-secondary" disabled={history.length === 0} onClick={() => { setCursor(history[history.length - 1]); setHistory(value => value.slice(0, -1)); }}>صفحهٔ قبل</button>
        <span>صفحهٔ {digits.format(history.length + 1)}</span>
        <button className="site-secondary" disabled={!report.nextCursor} onClick={() => { setHistory(value => [...value, cursor]); setCursor(report.nextCursor); }}>صفحهٔ بعد</button>
      </nav>
    </>}
  </section>;
}
function Summary({ label, value }: { label: string; value: string }) { return <div className={styles.total}><span>{label}</span><strong>{value}</strong></div>; }
function Fact({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd><bdi>{value}</bdi></dd></div>; }

