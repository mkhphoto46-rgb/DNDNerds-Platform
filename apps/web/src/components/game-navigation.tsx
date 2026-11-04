"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const destinations = [
  { href: "/play", label: "میزهای من", aliases: ["/account/games"] },
  { href: "/find-game", label: "پیدا کردن بازی", aliases: ["/account/find-game"] },
  { href: "/create-game", label: "ساخت میز", aliases: ["/account/create-game"] },
];

export function GameNavigation({ city = false }: { city?: boolean }) {
  const pathname = usePathname();
  return <nav className={`game-navigation${city ? " game-navigation-city" : ""}`} aria-label="دسترسی سریع بازی">
    {destinations.map(item => <Link key={item.href} href={item.href}
      aria-current={pathname === item.href || pathname.startsWith(`${item.href}/`) || item.aliases.includes(pathname) ? "page" : undefined}>
      {item.label}
    </Link>)}
    <Link className="game-navigation-invite" href="/find-game#join">ورود با کد دعوت</Link>
  </nav>;
}
