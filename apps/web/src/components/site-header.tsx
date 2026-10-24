import Image from "next/image";
import Link from "next/link";
import { AccountStatus } from "@/components/account-status";

const navigation = [
  { label: "بازی", href: "/play" },
  { label: "پیدا کردن بازی", href: "/find-game" },
  { label: "Dungeon Masters", href: "/find-dm" },
  { label: "Arena", href: "/arena" },
  { label: "Marketplace", href: "/store" },
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

        <nav
          className="desktop-nav"
          aria-label="منوی اصلی"
        >

          {navigation.map((item) => (

            <Link
              key={item.href}
              href={item.href}
            >
              {item.label}
            </Link>

          ))}

        </nav>

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

        <details className="mobile-menu">

          <summary aria-label="باز کردن منو">
            <span />
            <span />
            <span />
          </summary>

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

        </details>

      </div>

    </header>
  );
}