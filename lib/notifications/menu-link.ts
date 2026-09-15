import { isDateOnly } from '@/lib/leave-dates';

export function menuNotificationHref(data: Record<string, unknown> | undefined): string | null {
  if (!data || typeof data.type !== 'string' || !['menu_updated', 'swap_requested', 'swap_accepted', 'swap_rejected', 'swap_stale', 'swap_cancelled'].includes(data.type)) return null;
  if (typeof data.weekStart !== 'string' || !isDateOnly(data.weekStart)) return '/menu';
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const anchor = typeof data.requestId === 'string' && uuid.test(data.requestId) ? `request-${data.requestId}`
    : typeof data.notificationId === 'string' && uuid.test(data.notificationId) ? `notification-${data.notificationId}` : 'menu-requests';
  const notice = typeof data.notificationId === 'string' && uuid.test(data.notificationId) ? `&notice=${data.notificationId}` : '';
  return `/menu?week=${data.weekStart}${notice}#${anchor}`;
}
