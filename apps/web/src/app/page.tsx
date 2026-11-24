import type { Metadata } from "next";
import { GuildHome } from "@/components/guild-home";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    "title":  {
                  "absolute":  "دی‌انددی نردز (DND Nerds) | بازی آنلاین D\u0026D"
              },
    "description":  "دی‌انددی نردز محیط فارسی بازی آنلاین D\u0026D است. با گروهت در Web VTT بازی کن، در نقشه‌ساز نقشه بساز و در PvP Arena رقابت کن.",
    "alternates":  {
                       "canonical":  "https://dndnerds.ir/"
                   },
    "openGraph":  {
                      "title":  "دی‌انددی نردز (DND Nerds) | بازی آنلاین D\u0026D",
                      "description":  "دی‌انددی نردز محیط فارسی بازی آنلاین D\u0026D است. با گروهت در Web VTT بازی کن، در نقشه‌ساز نقشه بساز و در PvP Arena رقابت کن.",
                      "url":  "https://dndnerds.ir/",
                      "siteName":  "DND Nerds",
                      "locale":  "fa_IR",
                      "type":  "website",
                      "images":  [
                                     {
                                         "url":  "https://dndnerds.ir/knowledge-art/spells.webp"
                                     }
                                 ]
                  },
    "twitter":  {
                    "card":  "summary_large_image",
                    "title":  "دی‌انددی نردز (DND Nerds) | بازی آنلاین D\u0026D",
                    "description":  "دی‌انددی نردز محیط فارسی بازی آنلاین D\u0026D است. با گروهت در Web VTT بازی کن، در نقشه‌ساز نقشه بساز و در PvP Arena رقابت کن.",
                    "images":  [
                                   "https://dndnerds.ir/knowledge-art/spells.webp"
                               ]
                }
};

const websiteJsonLd = {
    "@context":  "https://schema.org",
    "@type":  "WebSite",
    "name":  "DND Nerds",
    "alternateName":  "دی‌انددی نردز",
    "url":  "https://dndnerds.ir/"
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(websiteJsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <GuildHome />
    </>
  );
}
