import { Sidebar } from '@/components/shared/sidebar';
import { Header } from '@/components/shared/header';
import { BottomNav } from '@/components/shared/bottom-nav';
import { PushNotificationPrompt } from '@/components/push-notification-prompt';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <Header />
        <main className="flex-1 p-4 lg:p-6 pb-24 lg:pb-6 relative z-0">
          <PushNotificationPrompt />
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
