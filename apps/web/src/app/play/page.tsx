import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = {
  title: "میز بازی تو همیشه آماده است",
};

export default function Page() {
  return (
    <PlaceholderPage
      eyebrow="Web VTT"
      title="میز بازی تو همیشه آماده است"
      description="وب وی‌تی‌تی DND Nerds به کمپین، جلسه، دسترسی‌ها و کتابخانه مرکزی متصل خواهد بود"
    />
  );
}