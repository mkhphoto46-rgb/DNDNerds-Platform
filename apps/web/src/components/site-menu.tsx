import Link from "next/link";
import { AutoCloseMenu } from "./auto-close-menu";
import { AccountStatus } from "./account-status";

const destinations = [
  ["/play", "میزهای من"], ["/find-game", "پیدا کردن بازی"],
  ["/create-game", "ساخت میز"], ["/find-game#join", "ورود با کد دعوت"],
  ["/account", "حساب من"], ["/account/profile", "پروفایل من"],
  ["/account/characters", "کاراکترهای من"], ["/account/dm", "صفحهٔ DM من"],
  ["/find-dm", "پیدا کردن DM"], ["/tavern", "Tavern"],
  ["/cartography", "نقشه‌خانه"], ["/blacksmith", "آهنگری"], ["/arena", "آرنا"],
  ["/store", "بازارچه"], ["/pricing", "اشتراک"], ["/orders", "سفارش‌ها"],
];
export function SiteMenu({ city = false }: { city?: boolean }) {
  return <AutoCloseMenu className={`site-menu ${city ? "town-menu" : ""}`}>
    <summary aria-label="منوی سایت"><span aria-hidden="true">☰</span></summary>
    <nav aria-label="بخش‌های سایت">{destinations.map(([href, label]) => <Link key={href} href={href!}>{label}</Link>)}
      <a href="https://www.instagram.com/dndnerds1" target="_blank" rel="noopener noreferrer">Instagram</a>
      <AccountStatus mobile />
    </nav>
  </AutoCloseMenu>;
}
