import type { Metadata } from "next";
import { GameDetail } from "@/components/game-detail";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "جزئیات کمپین" };
export default async function Page({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  return <GameDetail tableId={tableId} />;
}
