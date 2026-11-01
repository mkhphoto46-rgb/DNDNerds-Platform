'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { marketplaceImage } from '@/lib/marketplace-image';
import styles from '@/app/store/marketplace.module.css';

type Policy = { id: string; version: string; name: string; return_window_hours: number; settlement_delay_hours: number; approved: boolean };
type Delivery = { id: string; status: string; store_name: string; carrier: string | null; tracking_code: string | null; confirmed_at: string | null };
const base = '/api/marketplace/v21';
async function call(path: string, body?: unknown) {
  const response = await fetch(base + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? 'عملیات انجام نشد.');
  return result;
}
const reasonLabels: Record<string, string> = {
  POLICY_REQUIRED: 'سیاست مصوب ثبت نشده', POLICY_INVALID: 'سیاست تأیید نشده یا لغو شده', POLICY_VERSION_MISMATCH: 'نسخهٔ سیاست با تحویل سازگار نیست',
  LIVE_SERVICE_GATES_REQUIRED: 'پیش‌نیازهای سرویس مالی واقعی تأیید نشده', INDEPENDENT_DELIVERY_REQUIRED: 'تأیید مستقل تحویل لازم است',
  RETURN_WINDOW_OPEN: 'مهلت مرجوعی باز است', SETTLEMENT_DELAY_OPEN: 'مهلت سیاست تسویه تمام نشده', PAYMENT_NOT_RECONCILED: 'پرداخت تطبیق نشده',
  OPEN_DISPUTE: 'پروندهٔ اختلاف باز است', PENDING_REFUND: 'بازپرداخت تعیین تکلیف نشده', RISK_HOLD: 'سفارش یا فروشگاه مجاز به تسویه نیست',
};
export function DeliveryOperations() {
  const [policies, setPolicies] = useState<Policy[]>([]), [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [enabled, setEnabled] = useState(false), [password, setPassword] = useState(''), [reason, setReason] = useState('');
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  async function load() {
    const [p, d] = await Promise.all([call('/admin/payout-policies'), call('/admin/delivery-queue')]);
    setPolicies(p.data); setEnabled(p.writingEnabled); setDeliveries(d.data);
  }
  useEffect(() => { load().catch(error => setMessage(error.message)); }, []);
  async function save(path: string, extra: Record<string, unknown>) {
    setBusy(true);
    try { await call(path, { ...extra, password, reason }); setPassword(''); setMessage('بررسی ثبت شد؛ انتقال وجه انجام نشد.'); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'خطا'); }
    finally { setBusy(false); }
  }
  function createPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void save('/admin/payout-policies', { name: form.get('name'), evidenceRef: form.get('evidenceRef'),
      returnWindowHours: Number(form.get('returnWindowHours')), settlementDelayHours: Number(form.get('settlementDelayHours')) });
  }
  const disabled = busy || !enabled || password.length < 8 || reason.trim().length < 10;
  return <section className={styles.section}><h2>بررسی تحویل و سیاست تسویه</h2>
    <p>تأیید تحویل با آزادسازی وجه جداست. این بخش فعلاً برای بررسی آزمایشی آماده شده و انتقال وجه انجام نمی‌دهد.</p>
    {!enabled && <p>ثبت تصمیم عملیاتی در این محیط فعال نیست.</p>}
    <p role="status">{message}</p>
    <fieldset disabled={busy || !enabled} className={styles.marketFilters}><legend>تأیید هویت و دلیل تصمیم</legend>
      <label>رمز مدیر<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label>دلیل مکتوب<textarea maxLength={1000} minLength={10} value={reason} onChange={e => setReason(e.target.value)} /></label>
    </fieldset>
    <details><summary>نسخهٔ تازهٔ سیاست آزمایشی</summary><form onSubmit={createPolicy} className={styles.marketFilters}>
      <label>عنوان<input name="name" required minLength={3} maxLength={180} disabled={!enabled} /></label>
      <label>مرجع سیاست مکتوب<input name="evidenceRef" required minLength={10} maxLength={500} disabled={!enabled} /></label>
      <label>مهلت مرجوعی، ساعت<input name="returnWindowHours" type="number" required min="0" max="8784" disabled={!enabled} /></label>
      <label>فاصلهٔ پس از تأیید تحویل، ساعت<input name="settlementDelayHours" type="number" required min="0" max="8784" disabled={!enabled} /></label>
      <button disabled={disabled}>ثبت نسخهٔ تغییرناپذیر</button>
    </form></details>
    {policies.map(p => <article key={p.id} className={styles.variantPanel}><h3>{p.name} · نسخهٔ {p.version}</h3>
      <p>مرجوعی: {p.return_window_hours} ساعت · فاصلهٔ بررسی: {p.settlement_delay_hours} ساعت · {p.approved ? 'تأیید شده' : 'تأیید نشده یا لغوشده'}</p>
      <button disabled={disabled || p.approved} onClick={() => void save(`/admin/payout-policies/${p.id}/approve`, {})}>تأیید توسط مدیر مستقل</button>{' '}
      <button disabled={disabled} onClick={() => void save(`/admin/payout-policies/${p.id}/revoke`, {})}>لغو نسخه</button>
    </article>)}
    {deliveries.map(d => <article key={d.id} className={styles.variantPanel}><h3>{d.store_name} · {d.id.slice(0, 8)}</h3>
      <p>{d.carrier} · رهگیری: {d.tracking_code} · {d.confirmed_at ? 'تحویل مستقل ثبت شده' : 'در انتظار بررسی تحویل'}</p>
      {!d.confirmed_at && <form className={styles.marketFilters} onSubmit={async event => {
        event.preventDefault(); const data = new FormData(event.currentTarget); const file = data.get('image');
        if (!(file instanceof File) || !file.size) return;
        setBusy(true);
        try {
          const media = await call('/media', { dataWebp: await marketplaceImage(file) });
          await save(`/admin/seller-orders/${d.id}/delivery-review`, { mediaId: media.id, policyId: data.get('policyId'), deliveredAt: new Date(String(data.get('deliveredAt'))).toISOString() });
        } catch (error) { setMessage(error instanceof Error ? error.message : 'بارگذاری مدرک انجام نشد.'); }
        finally { setBusy(false); }
      }}>
        <label>نسخهٔ مصوب<select name="policyId" required disabled={!enabled}><option value="">انتخاب کنید</option>{policies.filter(p => p.approved).map(p => <option key={p.id} value={p.id}>{p.name} · {p.version}</option>)}</select></label>
        <label>زمان واقعی تحویل<input type="datetime-local" name="deliveredAt" required disabled={!enabled} /></label>
        <label>تصویر مدرک تحویل<input type="file" name="image" accept="image/png,image/jpeg,image/webp" required disabled={!enabled} /></label>
        <button disabled={disabled}>ثبت بررسی مستقل تحویل</button>
      </form>}
      <button disabled={busy} onClick={async () => {
        setBusy(true);
        try { const result = await call(`/admin/seller-orders/${d.id}/settlement-eligibility`);
          setMessage(result.eligible ? 'شرایط آزمایشی برقرار است؛ انتقال وجه همچنان فعال نیست.' : result.reasons.map((r: string) => reasonLabels[r] ?? 'نیازمند بررسی عملیاتی').join('؛ ')); }
        catch (error) { setMessage(error instanceof Error ? error.message : 'بررسی انجام نشد.'); }
        finally { setBusy(false); }
      }}>بررسی شرایط امکان تسویه</button>
    </article>)}
  </section>;
}
