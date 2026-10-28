import Image from "next/image";
import Link from "next/link";
import { GameNavigation } from "@/components/game-navigation";
import { AccountStatus } from "@/components/account-status";
import { AutoCloseMenu } from "@/components/auto-close-menu";

const navigation = [
  { label: "پیدا کردن DM", href: "/find-dm" },
  { label: "Tavern", href: "/tavern" },
  { label: "نقشه‌خانه", href: "/cartography" },
  { label: "آهنگری", href: "/blacksmith" },
  { label: "آرنا", href: "/arena" },
  { label: "بازارچه", href: "/store" },
  { label: "اشتراک", href: "/pricing" },
];

const instagramUrl = "https://www.instagram.com/dndnerds1?stkn=MXgwZ2FmMjJxZWQwOQ==";

function InstagramIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5"
      />

      <circle
        cx="12"
        cy="12"
        r="4.2"
      />

      <circle
        cx="17.4"
        cy="6.7"
        r="1"
        className="instagram-dot"
      />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">

      <div className="shell header-inner">

        <Link
          className="brand"
          href="/"
          aria-label="DND Nerds"
        >

          <div className="brand-logo-wrap">

            <Image
              src="/brand/dnd-nerds-logo.png"
              alt="DND Nerds"
              width={78}
              height={78}
              priority
              className="brand-logo-small"
            />

          </div>

          <div className="brand-copy">

            <strong>
              DND Nerds
            </strong>

            <small>
              YOUR TABLE · YOUR WORLD
            </small>

          </div>

        </Link>

        <GameNavigation />

        <div className="header-actions">

          <a
            className="instagram-link"
            href={instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            title="Instagram"
          >
            <InstagramIcon />
          </a>

          <AccountStatus />

        </div>

        <AutoCloseMenu className="mobile-menu">

          <summary>بخش‌های دیگر</summary>

          <div className="mobile-menu-panel">

            {navigation.map((item) => (

              <Link
                key={item.href}
                href={item.href}
              >
                {item.label}
              </Link>

            ))}

            <a
              className="mobile-instagram-link"
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Instagram
            </a>

            <AccountStatus mobile />

          </div>

        </AutoCloseMenu>

      </div>

    </header>
  );
}
