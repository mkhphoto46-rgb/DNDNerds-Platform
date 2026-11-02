"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeSiteDestination, siteDestinations } from "./site-destinations";
import { SiteIcon } from "./site-icon";
export function SiteNavigation() {
  const active = activeSiteDestination(usePathname());
  return <nav className="site-rail" aria-label="بخش‌های اصلی سایت">
    {siteDestinations.map(item => <Link key={item.href} href={item.href} aria-current={active === item.href ? "page" : undefined} title={item.status ? `${item.label} · ${item.status}` : item.label}>
      <SiteIcon name={item.icon} /><span>{item.label}</span>{item.status && <small>{item.status}</small>}
    </Link>)}
  </nav>;
}
