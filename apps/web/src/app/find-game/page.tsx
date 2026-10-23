import { redirect } from "next/navigation";

// Tables are private for now: a player joins with an invitation or the DM's code on /play.
export default function Page() {
  redirect("/play");
}
