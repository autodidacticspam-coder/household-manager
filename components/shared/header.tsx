'use client';

import { UserMenu } from './user-menu';
import { MobileSidebar } from './mobile-sidebar';

type HeaderProps = {
  title?: string;
};

export function Header({ title }: HeaderProps) {

  return (
    <header className="ios-header border-b">
      <div className="flex h-9 items-center gap-4 px-4 lg:px-6">
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
      </div>
    </header>
  );
}
