import type { Metadata } from "next";
import { GameHub } from "@/components/game-hub";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dungeon Masters" };
export default function Page() { return <GameHub mode="find-dm" />; }
