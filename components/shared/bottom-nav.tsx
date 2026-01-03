'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';
import { useCanAccessChildLogs } from '@/hooks/use-child-logs';
import { useCanAccessFoodRatings } from '@/hooks/use-menu-ratings';
import {
  LayoutDashboard,
  CheckSquare,
  Calendar,
  UtensilsCrossed,
  User,
  ClipboardList,
  Star,
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
  { href: '/logs', labelKey: 'nav.log', icon: <ClipboardList className="h-5 w-5" /> },
];

const employeeBaseNavItems: NavItem[] = [
  { href: '/my-tasks', labelKey: 'nav.myTasks', icon: <CheckSquare className="h-5 w-5" /> },
  { href: '/my-calendar', labelKey: 'nav.calendar', icon: <Calendar className="h-5 w-5" /> },
  { href: '/menu', labelKey: 'nav.menu', icon: <UtensilsCrossed className="h-5 w-5" /> },
];

// Chef-specific nav items: Tasks, Menu, Food Ratings, Supplies
const chefNavItems: NavItem[] = [
  { href: '/my-tasks', labelKey: 'nav.myTasks', icon: <CheckSquare className="h-5 w-5" /> },
  { href: '/menu', labelKey: 'nav.menu', icon: <UtensilsCrossed className="h-5 w-5" /> },
  { href: '/food-ratings', labelKey: 'nav.foodRatings', icon: <Star className="h-5 w-5" /> },
  { href: '/supply-requests', labelKey: 'nav.supplies', icon: <Package className="h-5 w-5" /> },
];

const logNavItem: NavItem = { href: '/logs', labelKey: 'nav.log', icon: <ClipboardList className="h-5 w-5" /> };
const profileNavItem: NavItem = { href: '/profile', labelKey: 'nav.profile', icon: <User className="h-5 w-5" /> };

export function BottomNav() {
  const t = useTranslations();
  const pathname = usePathname();
  const { isAdmin, isLoading } = useAuth();
  const { data: canAccessLogs } = useCanAccessChildLogs();
  const { data: isChef } = useCanAccessFoodRatings();

  if (isLoading) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border shadow-lg shadow-black/5 lg:hidden">
        <div className="flex justify-around items-center h-9">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center justify-center w-12 h-8">
              <div className="h-5 w-5 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>
        {/* Safe area spacing for iOS */}
        <div className="h-[env(safe-area-inset-bottom)] bg-background/95" />
      </nav>
    );
  }

  // Build employee nav items - show Log instead of Profile for nannies/teachers
  const employeeNavItems = [
    ...employeeBaseNavItems,
    canAccessLogs ? logNavItem : profileNavItem,
  ];

  // Use chef-specific nav for chef users (non-admin)
  const navItems = isAdmin ? adminNavItems : (isChef && !isAdmin) ? chefNavItems : employeeNavItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border shadow-lg shadow-black/5 lg:hidden">
      <div className="flex justify-around items-center h-9">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center justify-center min-w-[48px] px-2 py-1 rounded-lg transition-all duration-200',
                isActive
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent active:bg-accent/80'
              )}
            >
              <span className={cn(
                'transition-transform duration-200',
                isActive && 'scale-110'
              )}>
                {item.icon}
              </span>
            </Link>
          );
        })}
      </div>
      {/* Safe area spacing for iOS devices with home indicator */}
      <div className="h-[env(safe-area-inset-bottom)] bg-background/95" />
    </nav>
  );
}
