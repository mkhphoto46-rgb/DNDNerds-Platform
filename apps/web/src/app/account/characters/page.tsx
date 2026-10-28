import type { Metadata } from "next";
import CharacterEditor from "./character-editor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "کاراکترهای من" };
export default function Page() { return <CharacterEditor />; }
