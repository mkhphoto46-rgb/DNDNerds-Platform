import Link from "next/link";
import { AccountStatus } from "@/components/account-status";
import { AutoCloseMenu } from "@/components/auto-close-menu";
import { SiteIcon } from "./site-icon";
import { SiteSocialButton } from "./site-actions";
const navigation = [["بازی‌ها", "/games"], ["ابزارها و راهنما", "/tools"], ["حساب من", "/account"], ["حمایت از پروژه", "/support"], ["نظر و پیشنهاد", "/feedback"]];
export function SiteHeader() {
  return <header className="site-header">
    <Link className="site-brand" href="/" aria-label="DND Nerds، خانه"><img src="/site-ui/wordmark.png" alt="D&D Nerds" width="160" height="107" fetchPriority="high" /></Link>
    <div className="site-header-actions">
      <div className="site-account"><SiteIcon name="person" /><AccountStatus /></div>
      <SiteSocialButton /><SiteSocialButton notifications />
      <AutoCloseMenu className="site-menu">
        <summary className="site-round-button" aria-label="فهرست سایت"><SiteIcon name="menu" /></summary>
        <nav className="site-menu-panel" aria-label="همهٔ مسیرها"><strong>ماجراجویی تو</strong>
          {navigation.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
      </AutoCloseMenu>
    </div>
  </header>;
}
