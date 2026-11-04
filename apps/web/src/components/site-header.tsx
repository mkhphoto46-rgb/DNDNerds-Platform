import Image from "next/image";
import Link from "next/link";
import { SiteMenu } from "./site-menu";
export function SiteHeader() {
  return <header className="site-header"><div className="shell header-inner">
    <Link className="brand" href="/" aria-label="DND Nerds"><Image src="/brand/dnd-nerds-logo.png" alt="DND Nerds" width={66} height={66} priority className="brand-logo-small" /></Link>
    <SiteMenu />
  </div></header>;
}
