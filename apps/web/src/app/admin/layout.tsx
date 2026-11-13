import styles from "@/components/admin-navigation.module.css";
import { notFound, redirect } from "next/navigation";
import { apiFetch, getSessionToken } from "@/lib/bff-api";
import { Suspense } from "react";
import { AdminNavigation } from "@/components/admin-navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!await getSessionToken()) redirect("/login?next=%2Fadmin");
  const access = await apiFetch("/api/v1/admin/access", { signal: AbortSignal.timeout(5000) });
  if (access.status === 401) redirect("/login?next=%2Fadmin");
  if (access.status === 403) {
    const body = await access.json() as { error?: { code?: string } };
    if (body.error?.code === "ADMIN_MFA_REQUIRED") redirect("/security?adminMfa=required");
    if (body.error?.code === "ADMIN_MFA_LOGIN_REQUIRED") redirect("/login?next=%2Fadmin");
    notFound();
  }
  if (!access.ok) throw new Error("Administrator access could not be verified.");

  return <div className={styles.body}><Suspense fallback={null}><AdminNavigation/></Suspense>{children}</div>;
}
