import type { Metadata } from "next";
import PlayerPublicPage from "./public-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "صفحهٔ بازیکن" };
export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <PlayerPublicPage userId={userId} />;
}
