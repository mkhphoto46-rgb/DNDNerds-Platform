"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createTownWorld } from "./town-world";
import { XpBar } from "./xp-experience";
import { SiteTour } from "./site-tour";

const places = [
  { name: "دروازه شهر", title: "ماجرا از اینجا شروع می‌شود", hint: "قدم بزن و شهر را کشف کن", action: "شروع ماجراجویی", href: "/register" },
  { name: "Tavern", title: "همراهت را پیدا کن", hint: "میزهای تازه همین نزدیکی‌اند", action: "ورود به Tavern", href: "/tavern" },
  { name: "میدان", title: "میز بازی آماده است", hint: "نقشه، تاس و قصه در یک جا", action: "ورود به میز", href: "/play" },
  { name: "دوستان و گفتگو", title: "با گروهت در تماس باش", hint: "دوستان و گفتگو همیشه در دسترس", action: "باز کردن گفتگو", href: null },
  { name: "نقشه‌خانه", title: "دنیای خودت را رسم کن", hint: "نقشه ماجراجویی از همین‌جا آغاز می‌شود", action: "دیدن نقشه‌خانه", href: "/cartography" },
  { name: "بازارچه", title: "چیز تازه‌ای برای ماجرا", hint: "وسایل و محتوای بازی را ببین", action: "دیدن بازار", href: "/store" },
  { name: "میدان نبرد", title: "نوبت توست", hint: "یک نبرد کوتاه، یک تصمیم بزرگ", action: "ورود به Arena", href: "/arena" },
] as const;

type TownWorld = Awaited<ReturnType<typeof createTownWorld>>;

function openChat() { window.dispatchEvent(new Event("dnd-open-social")); }

function DieIcon() {
  return <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 3 54 17 58 43 32 60 6 43 10 17Z"/><path d="M10 17h44M6 43l26-9 26 9M32 3 21 26l11 8 11-8L32 3ZM21 26 6 43m37-17 15 17M32 34v26"/><text x="32" y="31" textAnchor="middle">20</text></svg>;
}

export function HomeTownExperience() {
  const router = useRouter();
  const [stage, setStage] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const [entering, setEntering] = useState<string | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const markerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const worldRef = useRef<TownWorld | null>(null);
  const stageRef = useRef(stage);
  const [worldFailed, setWorldFailed] = useState(false);
  const [worldReady, setWorldReady] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const ambienceRef = useRef<HTMLAudioElement>(null);
  const fountainRef = useRef<HTMLAudioElement>(null);
  const crowdRef = useRef<HTMLAudioElement>(null);
  const audioChannel = useRef<BroadcastChannel | null>(null);
  const wheelRef = useRef(0);
  const lastWheelStepRef = useRef(0);
  const touchRef = useRef<number | null>(null);

  const go = useCallback((value: number) => setStage(Math.max(0, Math.min(places.length - 1, value))), []);
  const enterPlace = useCallback((key: string) => {
    if (key === "guild") { openChat(); return; }
    const routes: Record<string,string> = { gate: "/register", tavern: "/tavern", play: "/play", cartography: "/cartography", blacksmith: "/blacksmith", market: "/store", arena: "/arena" };
    if (routes[key]) router.push(routes[key]);
  }, [router]);
  const startTransition = useCallback((key: string) => setEntering(key), []);

  useEffect(() => {
    let cancelled = false;
    const host = mountRef.current;
    if (!host) return;
    createTownWorld(host, markerRefs.current, value => setStage(value), enterPlace, startTransition).then(world => {
      if (cancelled) { world.dispose(); return; }
      worldRef.current = world;
      world.setStage(stageRef.current);
      requestAnimationFrame(() => { if (!cancelled) setWorldReady(true); });
    }).catch(() => { setWorldFailed(true); setWorldReady(true); });
    return () => { cancelled = true; worldRef.current?.dispose(); worldRef.current = null; };
  }, [enterPlace, startTransition]);

  useEffect(() => { stageRef.current = stage; worldRef.current?.setStage(stage); }, [stage]);

  useEffect(() => {
    const channel = new BroadcastChannel("dnd-town-audio");
    audioChannel.current = channel;
    channel.onmessage = () => setSoundOn(false);
    return () => { channel.close(); audioChannel.current = null; };
  }, []);
  useEffect(() => {
    const audio = audioRef.current;
    const ambience = ambienceRef.current;
    const fountain = fountainRef.current;
    const crowd = crowdRef.current;
    if (!audio || !ambience || !fountain || !crowd) return;
    if (soundOn) {
      audioChannel.current?.postMessage("claim-audio");
      audio.volume = .22;
      ambience.volume = .34;
      fountain.volume = 0;
      crowd.volume = 0;
      void Promise.all([audio.play(), ambience.play(), fountain.play(), crowd.play()]).catch(() => setSoundOn(false));
      const adjust = () => {
        const position = worldRef.current?.getCameraPosition();
        if (!position) return;
        const waterDistance = Math.hypot(position.x + .8, position.z + 4.5);
        const tavernDistance = Math.hypot(position.x + 5, position.z - 13);
        fountain.volume = .48 * Math.pow(Math.max(0, 1 - waterDistance / 14), 2);
        crowd.volume = .23 * Math.pow(Math.max(0, 1 - tavernDistance / 20), 2);
      };
      adjust();
      const timer = window.setInterval(adjust, 160);
      return () => { window.clearInterval(timer); audio.pause(); ambience.pause(); fountain.pause(); crowd.pause(); };
    }
    audio.pause(); ambience.pause(); fountain.pause(); crowd.pause();
    return () => { audio.pause(); ambience.pause(); fountain.pause(); crowd.pause(); };
  }, [soundOn]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest("button,a,input,textarea,summary,[data-social-dock]")) return;
      if (event.key === "ArrowDown" || event.key === "PageDown") { event.preventDefault(); setStage(s => Math.min(s + 1, places.length - 1)); }
      if (event.key === "ArrowUp" || event.key === "PageUp") { event.preventDefault(); setStage(s => Math.max(s - 1, 0)); }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const onWheel = (event: React.WheelEvent<HTMLElement>) => {
    if (performance.now() - lastWheelStepRef.current < 650) { wheelRef.current = 0; return; }
    wheelRef.current += event.deltaY;
    if (Math.abs(wheelRef.current) < 80) return;
    const direction = wheelRef.current > 0 ? 1 : -1;
    wheelRef.current = 0;
    lastWheelStepRef.current = performance.now();
    setStage(s => Math.max(0, Math.min(places.length - 1, s + direction)));
  };
  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    worldRef.current?.setPointer(event.clientX / window.innerWidth * 2 - 1, event.clientY / window.innerHeight * 2 - 1);
  };
  const onTouchStart = (event: React.TouchEvent<HTMLElement>) => { touchRef.current = event.touches[0]?.clientY ?? null; };
  const onTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    if (touchRef.current === null) return;
    const delta = touchRef.current - (event.changedTouches[0]?.clientY ?? touchRef.current);
    touchRef.current = null;
    if (Math.abs(delta) > 55) setStage(s => Math.max(0, Math.min(places.length - 1, s + (delta > 0 ? 1 : -1))));
  };
  const place = places[stage];

  return <main className="town-experience" onWheel={onWheel} onPointerMove={onPointerMove} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
    <div className={`town-world${worldFailed ? " town-world-fallback" : ""}`} ref={mountRef} aria-hidden="true" />
    <div className={`town-entry-image${entering || !worldReady ? " visible" : ""}`} aria-hidden="true"><span className="town-entry-wordmark">DND NERDS</span><span className="town-entry-die">◇</span></div>
    <div className="town-focus" aria-hidden="true" />
    <div className="town-landmarks" aria-label="تابلوهای شهر">
      <button ref={node => { markerRefs.current.tavern = node; }} type="button" onClick={() => go(1)}>✦ Tavern</button>
      <button ref={node => { markerRefs.current.guild = node; }} type="button" onClick={() => go(3)}>✦ دوستان و گفتگو</button>
      <button ref={node => { markerRefs.current.cartography = node; }} type="button" onClick={() => go(4)}>✦ نقشه‌خانه</button>
      <button ref={node => { markerRefs.current.market = node; }} type="button" onClick={() => go(5)}>✦ بازارچه</button>
      <button ref={node => { markerRefs.current.arena = node; }} type="button" onClick={() => go(6)}>✦ میدان نبرد</button>
    </div>

    <header className="town-hud">
      <Link className="town-brand" href="/" aria-label="DND Nerds، صفحه اصلی"><img className="town-logo" src="/brand/dnd-nerds-logo.png" width="100" height="100" alt="DND Nerds" /></Link>
      <div className="town-hud-actions">
        <SiteTour onStageChange={go} onOpenChat={openChat} />
        <button type="button" className="town-hud-button" onClick={() => setSoundOn(v => !v)} aria-pressed={soundOn}>{soundOn ? "♫ صدای شهر روشن" : "♫ صدای شهر خاموش"}</button>
        <button type="button" className="town-hud-button town-chat-button" onClick={openChat}>دوستان و گفتگو</button>
        <details className="town-menu"><summary aria-label="باز کردن مسیرها">☰</summary><nav aria-label="مسیرهای سایت"><Link href="/register">شروع ماجراجویی</Link><Link href="/tavern">Tavern</Link><Link href="/play">میز بازی</Link><Link href="/find-game">پیدا کردن بازی</Link><Link href="/find-dm">میزهای DM</Link><Link href="/cartography">نقشه‌خانه</Link><Link href="/blacksmith">آهنگری</Link><Link href="/arena">Arena</Link><Link href="/store">بازارچه</Link><Link href="/account">حساب من</Link></nav></details>
      </div>
    </header>

    <div className="town-xp-display"><XpBar compact /></div>

    <div className="town-story" aria-live="polite" key={stage}>
      <span className="town-eyebrow">{String(stage + 1).padStart(2, "0")} / {String(places.length).padStart(2, "0")} {place.name}</span>
      <h1>{place.title}</h1>
      <p>{place.hint}</p>
      <div className="town-story-actions">
        {place.href ? <Link className="town-primary" href={place.href} onClick={event => { if (worldRef.current) { event.preventDefault(); worldRef.current.enterStage(stage); } }}>{place.action} <span>←</span></Link> : <button type="button" className="town-primary" onClick={() => worldRef.current ? worldRef.current.enterStage(stage) : openChat()}>{place.action} <span>←</span></button>}
        <button type="button" className="town-quiet" onClick={() => go(stage + 1)} disabled={stage === places.length - 1}>قدم بعدی</button>
      </div>
    </div>

    <nav className="town-places" aria-label="محله‌های شهر">{places.map((item, index) => <button key={item.name} type="button" className={index === stage ? "active" : ""} onClick={() => index === stage ? worldRef.current?.enterStage(index) : go(index)} aria-current={index === stage ? "step" : undefined} title={index === stage ? `${item.name}؛ برای ورود کلیک کن` : item.name}><i/><span>{item.name}</span></button>)}</nav>

    <div className="town-bottom">
      <span className="town-movement-hint">WASD: حرکت، کشیدن موس: چرخش</span>
      <button type="button" className="town-die" onClick={() => go(stage + 1 === places.length ? 0 : stage + 1)} aria-label="برداشتن قدم بعدی با تاس D20"><DieIcon/></button>
      <span className="town-movement-hint">اسکرول: محله‌ها</span>
    </div>
    <audio ref={audioRef} src="/audio/tavern-instrumental.ogg" loop preload="none" aria-hidden="true" />
    <audio ref={ambienceRef} src="/audio/village-market.ogg" loop preload="none" aria-hidden="true" />
    <audio ref={fountainRef} src="/audio/fountain-water.mp3" loop preload="none" aria-hidden="true" />
    <audio ref={crowdRef} src="/audio/inn-crowd.ogg" loop preload="none" aria-hidden="true" />
  </main>;
}
