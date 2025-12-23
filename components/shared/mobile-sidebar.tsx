'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Menu,
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
  { href: '/employees', labelKey: 'nav.employees', icon: <Users className="h-5 w-5" /> },
  { href: '/leave-requests', labelKey: 'nav.leaveRequests', icon: <FileText className="h-5 w-5" /> },
  { href: '/supply-requests', labelKey: 'nav.supplyRequests', icon: <Package className="h-5 w-5" /> },
  { href: '/reports', labelKey: 'nav.reports', icon: <BarChart3 className="h-5 w-5" /> },
  { href: '/settings', labelKey: 'nav.settings', icon: <Settings className="h-5 w-5" /> },
];

const employeeNavItems: NavItem[] = [
  { href: '/my-tasks', labelKey: 'nav.myTasks', icon: <CheckSquare className="h-5 w-5" /> },
  { href: '/my-calendar', labelKey: 'nav.calendar', icon: <Calendar className="h-5 w-5" /> },
  { href: '/time-off', labelKey: 'nav.timeOff', icon: <Clock className="h-5 w-5" /> },
  { href: '/supplies', labelKey: 'nav.supplies', icon: <Package className="h-5 w-5" /> },
  { href: '/profile', labelKey: 'nav.profile', icon: <User className="h-5 w-5" /> },
  { href: '/settings', labelKey: 'nav.settings', icon: <Settings className="h-5 w-5" /> },
];

export function MobileSidebar() {
  const [open, setOpen] = useState(false);
  const t = useTranslations();
  const pathname = usePathname();
  const { isAdmin, isLoading } = useAuth();

  const navItems = isAdmin ? adminNavItems : employeeNavItems;

  // Show loading state in menu button while auth loads
  if (isLoading) {
    return (
      <Button variant="ghost" size="icon" className="lg:hidden" disabled>
        <Menu className="h-6 w-6 animate-pulse" />
        <span className="sr-only">Loading menu</span>
      </Button>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="h-6 w-6" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <div className="flex flex-col h-full">
          <div className="flex items-center h-16 px-6 border-b border-gray-200">
            <Link
              href={isAdmin ? '/dashboard' : '/my-tasks'}
              className="flex items-center space-x-2"
              onClick={() => setOpen(false)}
            >
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
                  onClick={() => setOpen(false)}
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
      </SheetContent>
    </Sheet>
  );
}
