import type { Metadata } from "next";
import { GameHub } from "@/components/game-hub";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
    "title":  {
                  "absolute":  "پیدا کردن میز بازی D\u0026D فارسی | DND Nerds"
              },
    "description":  "معرفی میزهای دی‌انددی نردز، زمان بازی و شرایط ورود را ببین و با کد دعوت به میز گروهت بپیوند.",
    "alternates":  {
                       "canonical":  "https://dndnerds.ir/find-game"
                   }
};
export default function Page() { return <GameHub mode="find-game" />; }
