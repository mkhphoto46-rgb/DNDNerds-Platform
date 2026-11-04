import Link from 'next/link';
import { SalesReport } from '@/components/marketplace/SalesReport';

import styles from '@/app/store/marketplace.module.css';

export const dynamic = 'force-dynamic';

export default function AdminSalesPage() {
  return <main className={styles.page} dir="rtl"><div className={styles.shell}><Link href="/admin">← پنل مدیریت</Link><h1>حسابداری و فروش</h1><SalesReport scope="admin" /></div></main>;
}
