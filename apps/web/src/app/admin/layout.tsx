import styles from "@/components/admin-navigation.module.css";
import { Suspense } from "react";
import { AdminNavigation } from "@/components/admin-navigation";

export default function AdminLayout({children}:{children:React.ReactNode}) {
  return <div className={styles.body}><Suspense fallback={null}><AdminNavigation/></Suspense>{children}</div>;
}
