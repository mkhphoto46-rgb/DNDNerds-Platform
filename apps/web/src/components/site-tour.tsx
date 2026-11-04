"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import "./site-tour.css";

const STORAGE_KEY = "dnd-nerds-site-tour-v1";
const steps = [
  { title: "به DND Nerds خوش آمدی", text: "در این شهر می‌توانی گروه بازی پیدا کنی، با دوستانت در تماس باشی و بخش‌های سایت را کشف کنی. برای ساخت یا ورود به میز بازی، ابتدا حساب بساز.", href: "/register", action: "ساخت حساب", stage: 0 },
  { title: "Tavern و پیدا کردن بازی", text: "از «پیدا کردن بازی» میزهای عمومی را ببین یا با کد دعوت وارد میز خصوصی شو. Dungeon Master می‌تواند میز بسازد و بازیکن‌ها با حساب سایت به آن بپیوندند.", href: "/find-game", action: "پیدا کردن بازی", stage: 1 },
  { title: "میز بازی", text: "از این مسیر به میزهای خودت برمی‌گردی. نقش پلیر یا DM کنار هر میز مشخص است؛ از همان‌جا وارد بازی شو یا میزت را مدیریت کن.", href: "/play", action: "میزهای من", stage: 2 },
  { title: "دوستان و گفتگو", text: "برای هماهنگی با گروهت، فهرست دوستان و گفت‌وگو را باز کن. از دکمهٔ «دوستان و گفتگو» بالای صفحه هم همیشه به آن دسترسی داری.", action: "باز کردن گفتگو", stage: 3 },
  { title: "نقشه‌خانه و آهنگری", text: "این دو بخش هنوز در حال ساخت‌اند. با ورود به هرکدام، وضعیت Coming Soon را می‌بینی.", href: "/cartography", action: "دیدن نقشه‌خانه", stage: 4 },
  { title: "بازارچه", text: "محتوای موجود را در بازارچه مرور کن. خریدهای انجام‌شده و وضعیت سفارش‌ها از بخش حساب کاربری در دسترس‌اند.", href: "/store", action: "رفتن به بازارچه", stage: 5 },
  { title: "Arena و حساب کاربری", text: "در Arena می‌توانی بخش رقابت را ببینی. از «حساب من» نیز XP، سفارش‌ها، امنیت حساب و تغییر رمز را پیدا می‌کنی.", href: "/account", action: "حساب من", stage: 6 },
] as const;

export function SiteTour({ onStageChange, onOpenChat }: { onStageChange: (stage: number) => void; onOpenChat: () => void }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);



  useEffect(() => {
    const openTour = () => { setIndex(0); setOpen(true); onStageChange(0); };
    window.addEventListener("dnd-open-tour", openTour);
    return () => window.removeEventListener("dnd-open-tour", openTour);
  }, [onStageChange]);

  function show(next: number) {
    const clamped = Math.max(0, Math.min(steps.length - 1, next));
    setIndex(clamped);
    onStageChange(steps[clamped].stage);
  }

  function close() {
    setOpen(false);
    try { window.localStorage.setItem(STORAGE_KEY, "done"); } catch {}
  }

  const step = steps[index];
  return <>
    <button type="button" className="town-hud-button site-tour-launch" aria-label="راهنمای سایت" onClick={() => { show(0); setOpen(true); }}>راهنمای سایت</button>
    {open && <section className="site-tour" role="dialog" aria-label="راهنمای بخش‌های سایت" dir="rtl">
      <div className="site-tour-top"><span>راهنمای DND Nerds</span><button type="button" onClick={close} aria-label="بستن راهنما">×</button></div>
      <div className="site-tour-progress" aria-label={`مرحله ${index + 1} از ${steps.length}`}>
        {steps.map((item, position) => <button key={item.title} type="button" aria-label={`مرحله ${position + 1}: ${item.title}`} aria-current={position === index ? "step" : undefined} onClick={() => show(position)} />)}
      </div>
      <span className="site-tour-count">{index + 1} از {steps.length}</span>
      <h2>{step.title}</h2>
      <p>{step.text}</p>
      <div className="site-tour-actions">
        {"href" in step ? <Link href={step.href} onClick={close}>{step.action} ←</Link> : <button type="button" onClick={() => { close(); onOpenChat(); }}>{step.action} ←</button>}
        <div><button type="button" disabled={index === 0} onClick={() => show(index - 1)}>قبلی</button><button type="button" onClick={() => index === steps.length - 1 ? close() : show(index + 1)}>{index === steps.length - 1 ? "پایان" : "بعدی"}</button></div>
      </div>
      <button type="button" className="site-tour-skip" onClick={close}>فعلاً رد کردن</button>
    </section>}
  </>;
}
