import type { Metadata } from "next";
import "@fontsource-variable/vazirmatn/index.css";

import "./site-foundation.css";
import "./site-theme.css";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { GlobalChatDock } from "@/components/global-chat-dock";
import { XpExperience } from "@/components/xp-experience";
import { SiteNavigation } from "@/components/site-navigation";
import { SiteMotion } from "@/components/site-actions";

export const metadata: Metadata = {
  title: {
    default: "DND Nerds",
    template: "%s | DND Nerds",
  },

  description:
    "DND Nerds پلتفرم کمپین، Web VTT، میزهای DM، DMless Arena و Store",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fa"
      dir="rtl"
    >
      <body>

        <div className="dnd-site-shell"><SiteMotion /><XpExperience><div className="app-shell">
          <SiteHeader />

          {children}

          <SiteFooter />
          <GlobalChatDock />
          <SiteNavigation />
        </div></XpExperience></div>

      </body>
    </html>
  );
}
