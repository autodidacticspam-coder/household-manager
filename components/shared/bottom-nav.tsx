'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { useCanAccessChildLogs } from '@/hooks/use-child-logs';
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  UtensilsCrossed,
  User,
  ClipboardList,
} from 'lucide-react';

type NavItem = {
  href: string;
  labelKey: string;
  icon: React.ReactNode;
};

const adminNavItems: NavItem[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: <LayoutDashboard className="h-6 w-6" /> },
  { href: '/tasks', labelKey: 'nav.tasks', icon: <CheckSquare className="h-6 w-6" /> },
  { href: '/calendar', labelKey: 'nav.calendar', icon: <Calendar className="h-6 w-6" /> },
  { href: '/logs', labelKey: 'nav.log', icon: <ClipboardList className="h-6 w-6" /> },
];

const employeeBaseNavItems: NavItem[] = [
  { href: '/my-tasks', labelKey: 'nav.myTasks', icon: <CheckSquare className="h-6 w-6" /> },
  { href: '/my-calendar', labelKey: 'nav.calendar', icon: <Calendar className="h-6 w-6" /> },
  { href: '/menu', labelKey: 'nav.menu', icon: <UtensilsCrossed className="h-6 w-6" /> },
];

const logNavItem: NavItem = { href: '/logs', labelKey: 'nav.log', icon: <ClipboardList className="h-6 w-6" /> };
const profileNavItem: NavItem = { href: '/profile', labelKey: 'nav.profile', icon: <User className="h-6 w-6" /> };

export function BottomNav() {
  const t = useTranslations();
  const pathname = usePathname();
  const { isAdmin, isLoading } = useAuth();
  const { data: canAccessLogs } = useCanAccessChildLogs();

  if (isLoading) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 lg:hidden">
        <div className="flex justify-around items-center h-16">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col items-center justify-center w-16 h-14">
              <div className="h-6 w-6 bg-gray-200 rounded animate-pulse" />
              <div className="h-2 w-8 bg-gray-200 rounded mt-1 animate-pulse" />
            </div>
          ))}
        </div>
        {/* Safe area spacing for iOS */}
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    );
  }

  // Build employee nav items - show Log instead of Profile for nannies/teachers
  const employeeNavItems = [
    ...employeeBaseNavItems,
    canAccessLogs ? logNavItem : profileNavItem,
  ];

  const navItems = isAdmin ? adminNavItems : employeeNavItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 lg:hidden">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center min-w-[64px] min-h-[48px] px-3 py-2 rounded-lg transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-gray-500 hover:text-gray-900 active:bg-gray-100'
              )}
            >
              <span className={cn(
                'transition-transform',
                isActive && 'scale-110'
              )}>
                {item.icon}
              </span>
              <span className={cn(
                'text-xs mt-1 font-medium',
                isActive ? 'text-primary' : 'text-gray-500'
              )}>
                {t(item.labelKey)}
              </span>
            </Link>
          );
        })}
      </div>
      {/* Safe area spacing for iOS devices with home indicator */}
      <div className="h-[env(safe-area-inset-bottom)] bg-white" />
    </nav>
  );
}
