"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { prepareProfileImage, profileRequest } from "@/lib/profile-pages";
import styles from "@/components/profile-pages.module.css";

type Character = { id: string; userId: string; name: string; className: string; subclass: string; race: string; background: string; level: number; currentHp: number; maxHp: number; description: string; story: string; portraitData: string | null; public: boolean };
type Form = Omit<Character, "id" | "userId">;
const blank: Form = { name: "", className: "", subclass: "", race: "", background: "", level: 1, currentHp: 1, maxHp: 1, description: "", story: "", portraitData: null, public: false };

export default function CharacterEditor() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [form, setForm] = useState<Form>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function reload() { setCharacters(await profileRequest<Character[]>("characters/me")); }
  useEffect(() => { void reload().catch(reason => setError(reason.message)).finally(() => setLoading(false)); }, []);
  async function chooseImage(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError("");
    try { const portraitData = await prepareProfileImage(file, "portrait"); setForm(current => ({ ...current, portraitData })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "تصویر پردازش نشد."); }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      await profileRequest<Character>(editing ? `characters/${editing}` : "characters", editing ? "PUT" : "POST", form);
      await reload(); setEditing(null); setForm(blank); setMessage(editing ? "کاراکتر ویرایش شد." : "کاراکتر ساخته شد.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "ذخیره ناموفق بود."); }
    finally { setBusy(false); }
  }
  async function remove(character: Character) {
    if (!window.confirm(`کاراکتر «${character.name}» حذف شود؟`)) return;
    setBusy(true); setError("");
    try { await profileRequest<{ id: string }>(`characters/${character.id}`, "DELETE"); await reload(); if (editing === character.id) { setEditing(null); setForm(blank); } setMessage("کاراکتر حذف شد."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "حذف ناموفق بود."); }
    finally { setBusy(false); }
  }

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.hero}><p>حساب من · پلیر</p><h1>کاراکترهای من</h1><p>تا سه نمای کلی از کاراکترهایت بساز. این بخش برگهٔ کامل بازی نیست.</p></header>
    <nav className={styles.tabs}><Link href="/account">حساب من</Link><Link href="/account/games">میزهای من</Link><Link href="/account/dm">صفحهٔ DM من</Link></nav>
    {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error} <Link href="/login?next=%2Faccount%2Fcharacters">ورود به حساب</Link></p>}
    {message && <p className={styles.notice} role="status">{message}</p>}
    {loading && <p role="status">در حال بارگذاری…</p>}
    {!loading && <><section className={styles.card}><h2>کاراکترها · {characters.length} از ۳</h2>
      {characters[0] && <p><Link href={`/player/${characters[0].userId}`}>دیدن صفحهٔ عمومی من ←</Link></p>}
      <div className={styles.grid}>{characters.map(character => <article className={styles.card} key={character.id}>
        {character.portraitData && <img className={styles.portrait} src={character.portraitData} alt={`پرترهٔ ${character.name}`} />}
        <h3>{character.name}</h3><div className={styles.tags}><span>سطح {character.level}</span><span>HP {character.currentHp}/{character.maxHp}</span><span>{character.className || "کلاس نامشخص"}</span></div>
        <p>{character.description || "هنوز توضیحی ثبت نشده است."}</p><small>{character.public ? "در صفحهٔ عمومی دیده می‌شود" : "فقط خودت می‌بینی"}</small>
        <div className={styles.actions}><button className={styles.secondary} disabled={busy} onClick={() => { setEditing(character.id); setForm(character); window.scrollTo({ top: 0, behavior: "smooth" }); }}>ویرایش</button><button className={styles.danger} disabled={busy} onClick={() => void remove(character)}>حذف</button></div>
      </article>)}</div>
      {!characters.length && <p className={styles.muted}>هنوز کاراکتری ثبت نکرده‌ای.</p>}
    </section>
    {(characters.length < 3 || editing) && <section className={styles.card}><h2>{editing ? "ویرایش کاراکتر" : "ساخت کاراکتر"}</h2><form className={styles.form} onSubmit={event => void save(event)}>
      <label className={styles.field}><span>نام کاراکتر</span><input required minLength={2} maxLength={80} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label className={styles.field}><span>نژاد / Race</span><input maxLength={80} value={form.race} onChange={e => setForm({ ...form, race: e.target.value })} /></label>
      <label className={styles.field}><span>کلاس</span><input maxLength={60} value={form.className} onChange={e => setForm({ ...form, className: e.target.value })} /></label>
      <label className={styles.field}><span>ساب‌کلاس</span><input maxLength={80} value={form.subclass} onChange={e => setForm({ ...form, subclass: e.target.value })} /></label>
      <label className={styles.field}><span>Background</span><input maxLength={120} value={form.background} onChange={e => setForm({ ...form, background: e.target.value })} /></label>
      <label className={styles.field}><span>سطح</span><input type="number" required min={1} max={20} value={form.level} onChange={e => setForm({ ...form, level: Number(e.target.value) })} /></label>
      <label className={styles.field}><span>HP فعلی</span><input type="number" required min={0} max={form.maxHp} value={form.currentHp} onChange={e => setForm({ ...form, currentHp: Number(e.target.value) })} /></label>
      <label className={styles.field}><span>حداکثر HP</span><input type="number" required min={1} max={999} value={form.maxHp} onChange={e => setForm({ ...form, maxHp: Number(e.target.value) })} /></label>
      <label className={`${styles.field} ${styles.wide}`}><span>ظاهر و توضیح کوتاه</span><textarea maxLength={1200} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
      <label className={`${styles.field} ${styles.wide}`}><span>داستان و پیشینهٔ کاراکتر</span><textarea rows={7} maxLength={3000} value={form.story} onChange={e => setForm({ ...form, story: e.target.value })} /></label>
      <label className={styles.field}><span>پرترهٔ کامل · تا ۶۰۰×۹۰۰ و ۱۹۰ کیلوبایت</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void chooseImage(e.target.files?.[0])} />{form.portraitData && <img className={styles.preview} src={form.portraitData} alt="پیش‌نمایش پرتره" />}</label>
      <label className={styles.check}><input type="checkbox" checked={form.public} onChange={e => setForm({ ...form, public: e.target.checked })} /> نمایش در صفحهٔ عمومی پلیر</label>
      <div className={`${styles.actions} ${styles.wide}`}><button disabled={busy}>{editing ? "ذخیرهٔ تغییرات" : "ساخت کاراکتر"}</button>{editing && <button type="button" className={styles.secondary} onClick={() => { setEditing(null); setForm(blank); }}>لغو ویرایش</button>}{form.portraitData && <button type="button" className={styles.secondary} onClick={() => setForm({ ...form, portraitData: null })}>حذف پرتره</button>}</div>
    </form></section>}
    </>}
  </div></main>;
}
