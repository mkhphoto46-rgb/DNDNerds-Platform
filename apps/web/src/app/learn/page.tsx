import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "کار با پلتفرم را یاد بگیر",
};

export default function Page() {
  return (
    <PlaceholderPage
      eyebrow="راهنما"
      title="کار با پلتفرم را یاد بگیر"
      description="راهنماهای استفاده از سایت، کمپین، Web VTT و ابزارهای مختلف در این بخش قرار می‌گیرند"
    />
  );
}