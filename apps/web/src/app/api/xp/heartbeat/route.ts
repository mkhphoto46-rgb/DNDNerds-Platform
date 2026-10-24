import { NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { apiFetch } from "@/lib/bff-api";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as { mode?: unknown };
    let init: RequestInit = { method: "POST" };
    if (body.mode === "game") {
      const presence = await fetch("http://127.0.0.1:4200/api/platform/xp-presence", {
        headers: { Cookie: request.headers.get("cookie") ?? "" }, cache: "no-store",
      });
      if (!presence.ok) return NextResponse.json({ error: { message: "حضور در بازی تأیید نشد." } }, { status: 403 });
      const { platformUserId } = await presence.json() as { platformUserId?: string };
      const secret = process.env.VTT_BRIDGE_SECRET ?? "";
      if (!platformUserId || secret.length < 32) return NextResponse.json({ error: { message: "اتصال XP بازی آماده نیست." } }, { status: 503 });
      init = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-xp-game-proof": createHmac("sha256", secret).update(`game-xp:${platformUserId}`).digest("hex"),
        },
        body: JSON.stringify({ mode: "game" }),
      };
    }
    const upstream = await apiFetch("/api/v1/xp/heartbeat", init);
    return NextResponse.json(await upstream.json(), { status: upstream.status });
  } catch {
    return NextResponse.json({ error: { message: "ارتباط با سرور برقرار نشد." } }, { status: 502 });
  }
}
