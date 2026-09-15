'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useMenuNotifications, useMenuUpdates, useReadMenuNotification } from '@/hooks/use-menu-requests';
import { useMenuSlotLabel } from '@/hooks/use-menu-swap';
import { useDateFormat } from '@/hooks/use-date-format';
import { notificationDetailsSchema } from '@/lib/validators/menu-requests';

export function MenuNotificationBell() {
  const t = useTranslations('menuRequests');
  const format = useDateFormat();
  const [limit, setLimit] = useState(50);
  const { data, isError, isLoading, refetch } = useMenuNotifications(limit);
  const read = useReadMenuNotification();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label={t('notificationCount', { count: data?.unread || 0 })}>
          <Bell className="h-4 w-4" />
          {!!data?.unread && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-[10px] text-white">{data.unread > 99 ? '99+' : data.unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-0">
        <h2 className="border-b p-3 font-semibold">{t('notifications')}</h2>
        <div className="max-h-[65dvh] overflow-y-auto divide-y">
          {isLoading && <p className="p-3 text-sm">{t('loading')}</p>}
          {isError && <div className="p-3" role="alert"><p>{t('loadFailed')}</p><Button variant="outline" onClick={() => void refetch()}>{t('retry')}</Button></div>}
          {!isLoading && !isError && data?.items.length === 0 && <p className="p-3 text-sm text-muted-foreground">{t('noNotifications')}</p>}
          {data?.items.map(item => (
            <Link key={item.id} href={`/menu?week=${item.week_start}&notice=${item.id}${item.request_id ? `#request-${item.request_id}` : `#notification-${item.id}`}`}
              onClick={() => { if (!item.read_at) read.mutate(item.id); setOpen(false); }}
              className={`block p-3 hover:bg-muted/60 ${!item.read_at ? 'bg-amber-50/60 dark:bg-amber-950/20' : ''}`}>
              <p className="text-sm font-medium">{t(`events.${item.kind}`)}{!item.read_at && <span className="ml-2 inline-block h-2 w-2 rounded-full bg-amber-600" aria-label={t('unread')} />}</p>
              <p className="text-xs text-muted-foreground">{t('weekOf', { date: format(new Date(item.week_start + 'T12:00:00'), 'MMM d') })}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.actor?.full_name} · {format(new Date(item.created_at), 'MMM d, h:mm a')}</p>
            </Link>
          ))}
          {data && data.items.length >= limit && <Button variant="ghost" className="w-full" onClick={() => setLimit(value => value + 50)}>{t('older')}</Button>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function MenuUpdateHistory({ weekStart }: { weekStart: string }) {
  const t = useTranslations('menuRequests');
  const label = useMenuSlotLabel();
  const format = useDateFormat();
  const { data: updates = [], isError, refetch } = useMenuUpdates(weekStart);
  const read = useReadMenuNotification();
  const scrolled = useRef(false);
  useEffect(() => {
    if (!scrolled.current && window.location.hash.startsWith('#notification-') && updates.length) {
      const target = document.getElementById(window.location.hash.slice(1));
      if (target) {
        if (target instanceof HTMLDetailsElement) target.open = true;
        target.scrollIntoView({ block: 'center' }); scrolled.current = true;
      }
    }
  }, [updates]);
  if (isError) return <div role="alert"><p>{t('loadFailed')}</p><Button variant="outline" onClick={() => void refetch()}>{t('retry')}</Button></div>;
  if (!updates.length) return null;
  return (
    <section className="space-y-2" aria-label={t('updates')}>
      <h2 className="text-lg font-semibold">{t('updates')}</h2>
      {updates.map(item => {
        const parsed = notificationDetailsSchema.safeParse(item.details);
        const details = parsed.success ? parsed.data : null;
        return <details key={item.id} id={`notification-${item.id}`} className="rounded-lg border bg-background p-3 scroll-mt-16 target:ring-2 target:ring-amber-500"
          open={typeof window !== 'undefined' && window.location.hash === `#notification-${item.id}`}
          onToggle={event => { if (event.currentTarget.open && !item.read_at && !read.isPending) read.mutate(item.id); }}>
          <summary className="cursor-pointer text-sm font-medium">{t('updatedBy', { name: item.actor?.full_name || t('chef') })} · {format(new Date(item.created_at), 'MMM d, h:mm a')}{!item.read_at && <span className="ml-2 text-xs text-amber-700">{t('unread')}</span>}</summary>
          <div className="mt-3 space-y-3 text-sm">
            {details?.changes.map(change => <div key={`${change.day}-${change.mealType}`}>
              <h3 className="font-semibold">{label(change)}</h3>
              <p className="whitespace-pre-wrap break-words text-muted-foreground">{t('before')}: {change.before || t('empty')}</p>
              <p className="whitespace-pre-wrap break-words">{t('after')}: {change.after || t('empty')}</p>
            </div>)}
            {details && details.notesBefore !== details.notesAfter && <div><h3 className="font-semibold">{t('menuNotes')}</h3><p className="whitespace-pre-wrap break-words text-muted-foreground">{t('before')}: {details.notesBefore || t('empty')}</p><p className="whitespace-pre-wrap break-words">{t('after')}: {details.notesAfter || t('empty')}</p></div>}
          </div>
        </details>;
      })}
    </section>
  );
}
