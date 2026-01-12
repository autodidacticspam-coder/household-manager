'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { useCanAccessFoodRatings } from '@/hooks/use-menu-ratings';
import { useCanAccessChildLogs } from '@/hooks/use-child-logs';
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  Users,
  FileText,
  BarChart3,
  Settings,
  Clock,
  User,
  Package,
  ClipboardList,
  UtensilsCrossed,
  Star,
} from 'lucide-react';

type NavItem = {
  href: string;
  labelKey: string;
  icon: React.ReactNode;
};

const adminNavItems: NavItem[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
  { href: '/tasks', labelKey: 'nav.tasks', icon: <CheckSquare className="h-5 w-5" /> },
  { href: '/calendar', labelKey: 'nav.calendar', icon: <Calendar className="h-5 w-5" /> },
  { href: '/menu', labelKey: 'nav.menu', icon: <UtensilsCrossed className="h-5 w-5" /> },
  { href: '/employees', labelKey: 'nav.employees', icon: <Users className="h-5 w-5" /> },
  { href: '/leave-requests', labelKey: 'nav.leaveRequests', icon: <FileText className="h-5 w-5" /> },
  { href: '/supply-requests', labelKey: 'nav.supplyRequests', icon: <Package className="h-5 w-5" /> },
  { href: '/reports', labelKey: 'nav.reports', icon: <BarChart3 className="h-5 w-5" /> },
  { href: '/settings', labelKey: 'nav.settings', icon: <Settings className="h-5 w-5" /> },
];

const employeeNavItems: NavItem[] = [
  { href: '/my-tasks', labelKey: 'nav.myTasks', icon: <CheckSquare className="h-5 w-5" /> },
  { href: '/my-calendar', labelKey: 'nav.calendar', icon: <Calendar className="h-5 w-5" /> },
  { href: '/menu', labelKey: 'nav.menu', icon: <UtensilsCrossed className="h-5 w-5" /> },
  { href: '/time-off', labelKey: 'nav.timeOff', icon: <Clock className="h-5 w-5" /> },
  { href: '/supplies', labelKey: 'nav.supplies', icon: <Package className="h-5 w-5" /> },
  { href: '/profile', labelKey: 'nav.profile', icon: <User className="h-5 w-5" /> },
  { href: '/settings', labelKey: 'nav.settings', icon: <Settings className="h-5 w-5" /> },
];

const logsNavItem: NavItem = { href: '/logs', labelKey: 'nav.log', icon: <ClipboardList className="h-5 w-5" /> };
const foodNavItem: NavItem = { href: '/food-ratings', labelKey: 'nav.food', icon: <Star className="h-5 w-5" /> };

export function Sidebar() {
  const t = useTranslations();
  const pathname = usePathname();
  const { isAdmin, isLoading } = useAuth();
  const { data: canAccessFoodRatings } = useCanAccessFoodRatings();
  const { data: canAccessLogs } = useCanAccessChildLogs();

  // Build nav items, conditionally including logs, food, and recipes
  const buildNavItems = () => {
    const items: NavItem[] = [];

    if (isAdmin) {
      // Admin nav: dashboard, tasks, calendar, [logs], menu, [food], [recipes], employees, leave-requests...
      items.push(adminNavItems[0]); // dashboard
      items.push(adminNavItems[1]); // tasks
      items.push(adminNavItems[2]); // calendar
      if (canAccessLogs) items.push(logsNavItem);
      items.push(adminNavItems[3]); // menu
      if (canAccessFoodRatings) {
        items.push(foodNavItem);
      }
      items.push(...adminNavItems.slice(4)); // employees, vacations, leave-requests, etc.
    } else {
      // Employee nav: my-tasks, [logs], my-calendar, menu, [food], time-off...
      items.push(employeeNavItems[0]); // my-tasks
      if (canAccessLogs) items.push(logsNavItem);
      items.push(employeeNavItems[1]); // my-calendar
      items.push(employeeNavItems[2]); // menu
      if (canAccessFoodRatings) {
        items.push(foodNavItem);
      }
      items.push(...employeeNavItems.slice(3)); // time-off, supplies, etc.
    }

    return items;
  };

  const navItems = buildNavItems();

  // Don't render navigation until auth is loaded to prevent flashing wrong menu
  if (isLoading) {
    return (
      <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 hidden lg:block">
        <div className="flex flex-col h-full">
          <div className="flex items-center h-16 px-6 border-b border-gray-200">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">H</span>
            </div>
            <span className="ml-2 text-lg font-semibold text-gray-900">
              {t('common.appName')}
            </span>
          </div>
          <nav className="flex-1 px-3 py-4">
            <div className="animate-pulse space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg" />
              ))}
            </div>
          </nav>
        </div>
      </aside>
    );
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 hidden lg:block">
      <div className="flex flex-col h-full">
        <div className="flex items-center h-16 px-6 border-b border-gray-200">
          <Link href={isAdmin ? '/dashboard' : '/my-tasks'} className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">H</span>
            </div>
            <span className="text-lg font-semibold text-gray-900">
              {t('common.appName')}
            </span>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                {item.icon}
                <span className="ml-3">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
