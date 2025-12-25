import { Sidebar } from '@/components/shared/sidebar';
import { Header } from '@/components/shared/header';
import { BottomNav } from '@/components/shared/bottom-nav';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className="lg:pl-64">
        <Header />
        <main className="p-4 lg:p-6 pb-24 lg:pb-6">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
