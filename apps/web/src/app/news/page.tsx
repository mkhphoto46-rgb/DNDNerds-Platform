import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "مسیر ساخت را دنبال کن",
};

export default function Page() {
  return (
    <PlaceholderPage
      eyebrow="اخبار"
      title="مسیر ساخت را دنبال کن"
      description="تغییرات، آپدیت‌ها و نسخه‌های جدید DND Nerds در این بخش منتشر می‌شوند"
    />
  );
}