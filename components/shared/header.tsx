'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';
import { UserMenu } from './user-menu';
import { MobileSidebar } from './mobile-sidebar';

type HeaderProps = {
  title?: string;
};

export function Header({ title }: HeaderProps) {
  const t = useTranslations();
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b bg-white px-4 lg:px-6">
      <MobileSidebar />

      <div className="flex-1">
        {title && (
          <h1 className="text-lg font-semibold text-gray-900 lg:text-xl">
            {title}
          </h1>
        )}
      </div>

      <div className="flex items-center gap-4">
        <UserMenu />
      </div>
    </header>
  );
}
