import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "بدون DM فقط رقابت",
};

export default function Page() {
  return (
    <PlaceholderPage
      eyebrow="آرنای رقابتی"
      title="بدون DM فقط رقابت"
      description="آرنای آینده شامل نبردهای 1v1، 2v2 و 3v3 با سیستم رتبه‌بندی و MMR خواهد بود"
    />
  );
}