"use client";
import { useCallback, useEffect, useRef } from "react";
import { createRefreshGate } from "./visible-refresh-gate.mjs";

/** Visible pages refresh on focus, every 15 seconds and after local mutations. */
export function useVisibleRefresh(work: () => Promise<unknown>) {
  const latest = useRef(work);
  latest.current = work;
  const gate = useRef<(() => Promise<void>) | null>(null);
  if (!gate.current) gate.current = createRefreshGate(() => latest.current(), () => typeof document !== "undefined" && document.visibilityState === "visible");
  const refresh = useCallback(() => gate.current!(), []);
  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 15_000);
    const update = () => { void refresh(); };
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("game-hub:changed", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); window.removeEventListener("game-hub:changed", update); };
  }, [refresh]);
  useEffect(() => { void refresh(); }, [work, refresh]);
  return refresh;
}
export function invalidateDiscovery() { window.dispatchEvent(new Event("game-hub:changed")); }
