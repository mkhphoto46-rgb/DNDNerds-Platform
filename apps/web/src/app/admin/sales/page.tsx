import Link from 'next/link';
import { SalesReport } from '@/components/marketplace/SalesReport';

export const dynamic = 'force-dynamic';

export default function AdminSalesPage() {
  return <main className="site-panel"><Link href="/admin">← پنل مدیریت</Link><h1>حسابداری و فروش</h1><SalesReport scope="admin" /></main>;
}
