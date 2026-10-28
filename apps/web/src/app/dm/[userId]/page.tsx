import type { Metadata } from "next";
import DmPublicPage from "./public-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "صفحهٔ DM" };
export default async function Page({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <DmPublicPage userId={userId} />;
}
