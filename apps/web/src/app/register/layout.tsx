import type { ReactNode } from "react";

// Auth forms must always use the current password and username policy.
export const dynamic = "force-dynamic";

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return children;
}
