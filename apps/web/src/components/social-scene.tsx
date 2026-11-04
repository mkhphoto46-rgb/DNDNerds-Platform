"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Stop = "street" | "square" | "inn";

const stops: Record<Stop, { title: string; caption: string; image: string; alt: string; sound: string }> = {
  street: {
    title: "کوچه ماجراجویان",
    caption: "Tavern سمت چپ؛ میدان روبه‌رو.",
    image: "/brand/hero/town-street.png",
    alt: "نمای رهگذر از کوچه‌ای روشن با خانه‌های چوبی در دو طرف، Tavern و میدان شهر",
    sound: "/audio/village-market.ogg",
  },
  square: {
    title: "میدان شهر",
    caption: "همراهانت همین‌جا جمع می‌شوند.",
    image: "/brand/hero/town-square.png",
    alt: "نمای نزدیک میدان یک شهر فانتزی شاد با فواره و تالار همراهان",
    sound: "/audio/village-market.ogg",
  },
  inn: {
    title: "Tavern خوش‌آمدگویی",
    caption: "بنشین و سر صحبت را باز کن.",
    image: "/brand/hero/town-inn.png",
    alt: "فضای گرم و دوستانه Tavern با مهمان‌ها و میزبان",
    sound: "/audio/inn-crowd.ogg",
  },
};

function openSocialDock() {
  window.dispatchEvent(new Event("dnd-open-social"));
}

function D20() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M32 3 54 17 58 43 32 60 6 43 10 17Z" />
      <path d="M10 17h44M6 43l26-9 26 9M32 3 21 26l11 8 11-8L32 3ZM21 26 6 43m37-17 15 17M32 34v26" />
      <text x="32" y="31" textAnchor="middle">20</text>
    </svg>
  );
}

export function SocialScene() {
  const [stop, setStop] = useState<Stop>("street");
  const [soundOn, setSoundOn] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const current = stops[stop];

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    if (!soundOn) return;
    audio.volume = 0.22;
    audio.load();
    void audio.play().catch(() => setSoundOn(false));
    return () => audio.pause();
  }, [soundOn, current.sound]);

  const nextStop = () => setStop(value => value === "street" ? "square" : value === "square" ? "inn" : "street");

  return (
    <div className="scene-shell social-scene" dir="rtl">
      <div className="social-scene-heading">
        <div className="scene-kicker"><span>06</span> COMPANIONS</div>
        <h2>در شهر قدم بزن؛ <em>ماجرا همین‌جاست.</em></h2>
        <p>{current.caption}</p>
      </div>

      <div className="social-walk" aria-label={`مکان کنونی: ${current.title}`}>
        <div className="social-walk-art" key={stop}>
          <Image src={current.image} alt={current.alt} fill priority={stop === "street"} sizes="(max-width: 900px) 100vw, 80vw" />
        </div>
        <div className="social-walk-vignette" aria-hidden="true" />
        <div className="social-walk-plaque" aria-live="polite"><span>اکنون در</span><strong>{current.title}</strong></div>

        {stop === "street" && <>
          <button type="button" className="social-sign social-sign-street-inn" onClick={() => setStop("inn")}><span>✦</span> Tavern <small>وارد شو</small></button>
          <button type="button" className="social-sign social-sign-street-square" onClick={() => setStop("square")}><span>✦</span> میدان شهر <small>ادامه مسیر</small></button>
        </>}
        {stop === "square" && <>
          <button type="button" className="social-sign social-sign-square-friends" onClick={openSocialDock}><span>✦</span> تالار همراهان <small>دوستان و گفتگو</small></button>
          <button type="button" className="social-sign social-sign-square-inn" onClick={() => setStop("inn")}><span>✦</span> Tavern <small>سری بزن</small></button>
          <button type="button" className="social-sign social-sign-square-back" onClick={() => setStop("street")}>← بازگشت به کوچه</button>
        </>}
        {stop === "inn" && <>
          <button type="button" className="social-sign social-sign-inn-talk" onClick={openSocialDock}><span>✦</span> سر صحبت را باز کن <small>دوستان و گفتگو</small></button>
          <button type="button" className="social-sign social-sign-inn-back" onClick={() => setStop("square")}>← خروج به میدان</button>
        </>}

        <div className="social-walk-toolbar">
          <button type="button" className="social-walk-die" onClick={nextStop} aria-label="قدم بعدی در شهر"><D20 /></button>
          <span className="social-walk-tip">روی تاس بزن و قدم بعدی را بردار</span>
          <button type="button" className="social-walk-sound" aria-pressed={soundOn} onClick={() => setSoundOn(value => !value)}>{soundOn ? "♪ صدای شهر: روشن" : "♪ صدای شهر: خاموش"}</button>
        </div>
      </div>

      <div className="social-scene-links">
        <button type="button" className="button button-primary" onClick={openSocialDock}>دوستان و گفتگو</button>
        <Link className="button button-ghost" href="/find-game">پیدا کردن بازی</Link>
        <Link className="social-scene-play" href="/play">ورود به بازی ←</Link>
      </div>
      <audio ref={audioRef} src={current.sound} loop preload="none" aria-hidden="true" />
    </div>
  );
}
