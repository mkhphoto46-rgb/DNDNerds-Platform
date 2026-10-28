import Link from "next/link";
import { AutoCloseMenu } from "./auto-close-menu";
const destinations = [["/games", "بازی‌ها"], ["/tools", "ابزارها"], ["/store", "بازارچه"], ["/account", "حساب من"]] as const;
export function SiteMenu({ city = false }: { city?: boolean }) {
  return <AutoCloseMenu className={`site-menu ${city ? "town-menu" : ""}`}>
    <summary aria-label="منوی سایت"><span aria-hidden="true">☰</span></summary>
    <nav aria-label="بخش‌های سایت">{destinations.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}</nav>
  </AutoCloseMenu>;
}
