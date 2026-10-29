"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { fetchSession } from "@/lib/session-client";
import "./xp-experience.css";

type XpState = { totalXp: number; level: number; levelXp: number; xpToNextLevel: number; leveledUp?: boolean };
const XpContext = createContext<XpState | null>(null);

function playLevelSound(context: AudioContext) {
  void context.resume().then(() => {
    const start = context.currentTime + .03;
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index === 4 ? "sine" : "triangle";
      oscillator.frequency.setValueAtTime(frequency, start + index * .11);
      gain.gain.setValueAtTime(.0001, start + index * .11);
      gain.gain.exponentialRampToValueAtTime(index === 4 ? .14 : .1, start + index * .11 + .035);
      gain.gain.exponentialRampToValueAtTime(.0001, start + index * .11 + .55);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + index * .11);
      oscillator.stop(start + index * .11 + .58);
    });
  }).catch(() => {});
}

export function XpExperience({ children }: { children: React.ReactNode }) {
  const [xp, setXp] = useState<XpState | null>(null);
  const [celebration, setCelebration] = useState<number | null>(null);
  const previous = useRef<XpState | null>(null);
  const sound = useRef<AudioContext | null>(null);
  const busy = useRef(false);
  const signedIn = useRef<boolean | null>(null);
  const generation = useRef(0);

  const refresh = useCallback(async (heartbeat = false) => {
    if (busy.current || document.visibilityState !== "visible") return;
    if (heartbeat && signedIn.current === false) return;
    const version = generation.current;
    busy.current = true;
    try {
      const session = await fetchSession();
      if (version !== generation.current) return;
      if (session.status === 401) { signedIn.current = false; previous.current = null; setXp(null); return; }
      if (!session.ok) return;
      signedIn.current = true;
      const response = await fetch(heartbeat ? "/api/xp/heartbeat" : "/api/xp", { method: heartbeat ? "POST" : "GET", cache: "no-store" });
      if (version !== generation.current) return;
      if (response.status === 401) { signedIn.current = false; previous.current = null; setXp(null); return; }
      if (!response.ok) return;
      const next = await response.json() as XpState;
      if (version !== generation.current) return;
      if (previous.current && next.level > previous.current.level) {
        setCelebration(next.level);
        if (sound.current) playLevelSound(sound.current);
      }
      previous.current = next;
      setXp(next);
    } catch { /* The visible bar keeps its last known value when offline. */ }
    finally { busy.current = false; if (version !== generation.current) void refresh(); }
  }, []);

  useEffect(() => {
    const unlock = () => { if (typeof AudioContext === "undefined") return; if (!sound.current) sound.current = new AudioContext(); void sound.current.resume().catch(() => {}); };
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const onAuth = () => { generation.current++; signedIn.current = null; previous.current = null; setXp(null); void refresh(); };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    window.addEventListener("focus", onVisible);
    window.addEventListener("dnd-auth-change", onAuth);
    document.addEventListener("visibilitychange", onVisible);
    void refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(true); }, 60_000);
    return () => { window.clearInterval(timer); window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); window.removeEventListener("focus", onVisible); window.removeEventListener("dnd-auth-change", onAuth); document.removeEventListener("visibilitychange", onVisible); void sound.current?.close(); };
  }, [refresh]);

  useEffect(() => { if (celebration === null) return; const timer = window.setTimeout(() => setCelebration(null), 4400); return () => window.clearTimeout(timer); }, [celebration]);

  return <XpContext.Provider value={xp}>
    {children}
    {celebration !== null && <div className="xp-level-backdrop" role="status" aria-live="assertive" onClick={() => setCelebration(null)}>
      <div className="xp-level-burst" aria-hidden="true"><span>✦</span><span>✧</span><span>✦</span><span>✧</span><span>✦</span><span>✧</span></div>
      <div className="xp-level-modal">
        <span className="xp-level-eyebrow">DND NERDS · LEVEL UP</span>
        <div className="xp-level-emblem"><span>{celebration}</span></div>
        <h2>به سطح {celebration.toLocaleString("fa-IR")} رسیدی!</h2>
        <p>ماجراجویی‌ات ادامه دارد</p>
      </div>
    </div>}
  </XpContext.Provider>;
}

export function XpBar({ compact = false }: { compact?: boolean }) {
  const xp = useContext(XpContext);
  if (!xp) return null;
  return <div className={`xp-progress${compact ? " xp-progress-compact" : ""}`} role="progressbar" aria-label={`سطح ${xp.level}، پیشرفت تا سطح بعد`} aria-valuenow={xp.levelXp} aria-valuemin={0} aria-valuemax={xp.xpToNextLevel}>
    <div className="xp-progress-labels"><strong>LVL {xp.level.toLocaleString("en-US")}</strong><span dir="ltr">{xp.levelXp.toLocaleString("en-US")} <i>/</i> {xp.xpToNextLevel.toLocaleString("en-US")} XP</span></div>
    <div className="xp-progress-track"><span style={{ width: `${Math.min(100, xp.levelXp / xp.xpToNextLevel * 100)}%` }} /></div>
    {!compact && <small>مجموع تجربه: {xp.totalXp.toLocaleString("fa-IR")} XP</small>}
  </div>;
}
