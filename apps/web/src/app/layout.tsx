import type { Metadata } from "next";

import "./globals.css";
import "./scene-v2.css";
import "./social-scene.css";
import "./home-town.css";

import { GlobalMagicParticles } from "@/components/global-magic-particles";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { GlobalChatDock } from "@/components/global-chat-dock";

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

        <GlobalMagicParticles />

        <div className="app-shell">
          <SiteHeader />

          {children}

          <SiteFooter />
          <GlobalChatDock />
        </div>

      </body>
    </html>
  );
}
