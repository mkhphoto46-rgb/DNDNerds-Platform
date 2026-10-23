import type { Metadata } from "next";
import { TableClient } from "./table-client";

export const metadata: Metadata = {
  title: "میز بازی",
};

export default async function Page({ params }: { params: Promise<{ tableId: string }> }) {
  const { tableId } = await params;
  return <TableClient tableId={tableId} />;
}
