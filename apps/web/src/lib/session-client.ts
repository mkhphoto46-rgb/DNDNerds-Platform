"use client";

import { createSessionRequest } from "./session-request";

const session = createSessionRequest(() => fetch("/api/auth/me", {
  credentials: "same-origin", cache: "no-store",
}));

if (typeof window !== "undefined") {
  window.addEventListener("dnd-auth-change", () => session.invalidate(), { capture: true });
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("dnd-nerds-auth-state");
    channel.onmessage = event => {
      if (event.data === "auth-change") window.dispatchEvent(new Event("dnd-auth-change"));
    };
  }
}

export function fetchSession({ fresh = false }: { fresh?: boolean } = {}) {
  if (fresh) session.invalidate();
  return session.get();
}
