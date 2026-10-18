import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "قبل از ورود DM را بشناس",
};

export default function Page() {
  return (
    <PlaceholderPage
      eyebrow="DMها"
      title="قبل از ورود DM را بشناس"
      description="پروفایل دی‌ام، سبک اجرا، سابقه بازی و میزهای فعال در این بخش قرار می‌گیرند"
    />
  );
}