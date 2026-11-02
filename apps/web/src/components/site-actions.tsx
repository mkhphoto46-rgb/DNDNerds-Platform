"use client";
import { useEffect, useState } from "react";
import { SiteIcon } from "./site-icon";
export function SiteSocialButton({ notifications = false }: { notifications?: boolean }) {
  return <button type="button" className="site-round-button" aria-label={notifications ? "دعوت‌ها و درخواست‌های دوستی" : "دوستان و گفتگو"} onClick={() => window.dispatchEvent(new Event("dnd-open-social"))}><SiteIcon name={notifications ? "alert" : "chat"} /></button>;
}
export function SiteMotion() {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const update = () => setPaused(document.hidden);
    update(); document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return <div className={`site-environment${paused ? " is-paused" : ""}`} aria-hidden="true" />;
}
