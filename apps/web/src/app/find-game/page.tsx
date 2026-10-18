import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "کمپین بعدی‌ات را پیدا کن",
};

export default function Page() {
  return (
    <PlaceholderPage
      eyebrow="پیدا کردن بازی"
      title="کمپین بعدی‌ات را پیدا کن"
      description="اینجا می‌توانی میزهای رایگان و پولی را بر اساس زمان، زبان، سبک بازی و ظرفیت بازیکن‌ها پیدا کنی"
    />
  );
}