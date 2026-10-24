import type { Metadata } from "next";
import { GameHub } from "@/components/game-hub";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "پیدا کردن بازی" };
export default function Page() { return <GameHub mode="find-game" />; }
