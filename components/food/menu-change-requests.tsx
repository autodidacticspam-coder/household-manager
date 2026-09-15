'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeftRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMenuRequests, useMenuRequestMutation, type MenuChangeRequest } from '@/hooks/use-menu-requests';
import { useMenuSlotLabel } from '@/hooks/use-menu-swap';
import { useDateFormat } from '@/hooks/use-date-format';
import { useAuth } from '@/contexts/auth-context';
import type { MenuSlot } from '@/lib/validators/menu-swap';

function RequestCard({ request, canRespond }: { request: MenuChangeRequest; canRespond: boolean }) {
  const t = useTranslations('menuRequests');
  const label = useMenuSlotLabel();
  const format = useDateFormat();
  const { user } = useAuth();
  const mutation = useMenuRequestMutation();
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pending = request.status === 'pending';
  async function respond(decision: 'accepted' | 'rejected' | 'cancelled') {
    setError(null);
    const result = await mutation.mutateAsync({ id: request.id, decision, reply });
    if ('error' in result) setError(result.error);
  }
  return (
    <article id={`request-${request.id}`} className="space-y-3 rounded-lg border bg-background p-4 scroll-mt-16 target:ring-2 target:ring-amber-500">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t('requestedBy', { name: request.requester?.full_name || t('admin') })} · {format(new Date(request.created_at), 'MMM d, h:mm a')}</p>
        <Badge variant={pending ? 'secondary' : 'outline'}>{t(`status.${request.status}`)}</Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        {([
          { day: request.day_a, mealType: request.meal_a, content: request.content_a },
          { day: request.day_b, mealType: request.meal_b, content: request.content_b },
        ] as (MenuSlot & { content: string })[]).map((slot, index) => (
          <div key={index} className="contents">
            {index === 1 && <ArrowLeftRight className="h-4 w-4 text-amber-700" aria-label={t('swap')} />}
            <div className="min-w-0 rounded-md bg-muted/40 p-3">
              <h4 className="text-sm font-semibold">{label(slot)}</h4>
              <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{slot.content || t('empty')}</p>
            </div>
          </div>
        ))}
      </div>
      {request.note && <p className="whitespace-pre-wrap break-words text-sm"><span className="font-medium">{t('note')}: </span>{request.note}</p>}
      {request.responded_at && <p className="text-xs text-muted-foreground">{t('respondedBy', { name: request.responder?.full_name || t('chef') })} · {format(new Date(request.responded_at), 'MMM d, h:mm a')}</p>}
      {request.reply && <p className="whitespace-pre-wrap break-words rounded-md bg-amber-50 p-3 text-sm dark:bg-amber-950/30"><span className="font-medium">{t('chefReply')}: </span>{request.reply}</p>}
      {request.status === 'accepted' && <p className="text-sm text-green-700 dark:text-green-400">{t('applied')}</p>}
      {request.status === 'rejected' && <p className="text-sm text-muted-foreground">{t('notApplied')}</p>}
      {request.status === 'stale' && <p className="text-sm text-amber-800 dark:text-amber-300">{t('staleExplanation')}</p>}
      {pending && canRespond && (
        <div className="space-y-2">
          <Label htmlFor={`reply-${request.id}`}>{t('replyOptional')}</Label>
          <Textarea id={`reply-${request.id}`} value={reply} onChange={e => setReply(e.target.value)} maxLength={2000} rows={2} disabled={mutation.isPending} />
          <p className="text-xs text-muted-foreground">{t('acceptHelp')}</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={mutation.isPending} onClick={() => void respond('accepted')}>{mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('accept')}</Button>
            <Button variant="outline" disabled={mutation.isPending} onClick={() => void respond('rejected')}>{t('reject')}</Button>
          </div>
        </div>
      )}
      {pending && request.requested_by === user?.id && <Button variant="ghost" size="sm" disabled={mutation.isPending} onClick={() => void respond('cancelled')}>{t('withdraw')}</Button>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </article>
  );
}

export function MenuChangeRequests({ weekStart, canRespond, enabled }: { weekStart: string; canRespond: boolean; enabled: boolean }) {
  const t = useTranslations('menuRequests');
  const { data, isLoading, isError, refetch } = useMenuRequests(weekStart, enabled);
  const scrolled = useRef(false);
  useEffect(() => {
    if (!scrolled.current && window.location.hash.startsWith('#request-') && data?.length) {
      const target = document.getElementById(window.location.hash.slice(1));
      if (target) {
        const history = target.closest('details');
        if (history) history.open = true;
        target.scrollIntoView({ block: 'center' }); scrolled.current = true;
      }
    }
  }, [data]);
  if (!enabled) return null;
  const pending = data?.filter(request => request.status === 'pending') || [];
  const history = data?.filter(request => request.status !== 'pending') || [];
  return (
    <section id="menu-requests" className="space-y-3 scroll-mt-16" aria-label={t('heading')}>
      <div className="flex items-center gap-2"><h2 className="text-lg font-semibold">{t('heading')}</h2>{pending.length > 0 && <Badge>{pending.length}</Badge>}</div>
      {isLoading && <p role="status" className="text-sm text-muted-foreground">{t('loading')}</p>}
      {isError && <div role="alert"><p>{t('loadFailed')}</p><Button variant="outline" onClick={() => void refetch()}>{t('retry')}</Button></div>}
      {!isLoading && !isError && !pending.length && <p className="text-sm text-muted-foreground">{t('noPending')}</p>}
      {pending.map(request => <RequestCard key={request.id} request={request} canRespond={canRespond} />)}
      {history.length > 0 && <details open={typeof window !== 'undefined' && window.location.hash.startsWith('#request-')}>
        <summary className="cursor-pointer py-2 text-sm font-medium">{t('history', { count: history.length })}</summary>
        <div className="space-y-3">{history.map(request => <RequestCard key={request.id} request={request} canRespond={false} />)}</div>
      </details>}
    </section>
  );
}
