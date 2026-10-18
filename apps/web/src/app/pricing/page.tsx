import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "مدت حضورت را خودت انتخاب کن",
};

export default function Page() {
  return (
    <PlaceholderPage
      eyebrow="اشتراک"
      title="مدت حضورت را خودت انتخاب کن"
      description="اشتراک‌های یک‌ماهه، شش‌ماهه و دوازده‌ماهه با فعال‌سازی و پایان خودکار در این بخش مدیریت می‌شوند"
    />
  );
}