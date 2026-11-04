import type { Metadata } from "next";
import DmPageEditor from "./dm-page-editor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "صفحهٔ DM من" };
export default function Page() { return <DmPageEditor />; }
