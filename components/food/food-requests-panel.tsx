'use client';

import { useMemo, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Check, Loader2, Search, Send, X } from 'lucide-react';
import { FoodRequestInsights } from '@/components/food/food-request-insights';
import { MealSuggestions } from '@/components/food/meal-suggestions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { FoodRequest } from '@/hooks/use-food-requests';
import { cn } from '@/lib/utils';

export type FoodRequestView = 'pending' | 'history' | 'insights';

type Props = {
  requests: FoodRequest[];
  userId?: string;
  isAdmin: boolean;
  view: FoodRequestView;
  onViewChange: (view: FoodRequestView) => void;
  onNewRequest: (foodName?: string) => void;
  onComplete: (id: string) => void;
  onCancel: (id: string) => void;
  completingId?: string;
  cancellingId?: string;
  error?: boolean;
  onRetry: () => void;
};

export function FoodRequestsPanel({ requests, userId, isAdmin, view, onViewChange, onNewRequest, onComplete, onCancel, completingId, cancellingId, error, onRetry }: Props) {
  const t = useTranslations('foodRequests');
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState('');
  const scopedRequests = useMemo(() => requests.filter(request => {
    if (mineOnly && request.requestedBy !== userId) return false;
    const term = search.trim().toLocaleLowerCase();
    return !term || [request.foodName, request.canonicalFoodName, request.notes, request.requestedByUser?.fullName]
      .some(value => value?.toLocaleLowerCase().includes(term));
  }), [requests, mineOnly, userId, search]);
  const pending = scopedRequests.filter(request => request.status === 'pending');
  const history = scopedRequests.filter(request => request.status !== 'pending');
  const current = view === 'history' ? history : pending;

  return (
    <Card>
      <CardHeader className="gap-3 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5 shrink-0" />{t('title')}</CardTitle>
            <CardDescription className="mt-1">{t('subtitle')}</CardDescription>
          </div>
          {isAdmin && <Button size="sm" className="shrink-0" onClick={() => onNewRequest()}>{t('newRequest')}</Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div role="alert" className="space-y-3 py-5 text-center">
            <p>{t('loadError')}</p><Button variant="outline" onClick={onRetry}>{t('retry')}</Button>
          </div>
        ) : (
          <Tabs value={view} onValueChange={value => onViewChange(value as FoodRequestView)} className="gap-4">
            <TabsList className="w-full h-auto flex-wrap" aria-label={t('views')}>
              <TabsTrigger value="pending" className="min-h-9 gap-2">{t('pending')}<Badge variant="secondary">{pending.length}</Badge></TabsTrigger>
              <TabsTrigger value="history" className="min-h-9 gap-2">{t('history')}<Badge variant="secondary">{history.length}</Badge></TabsTrigger>
              {isAdmin && <TabsTrigger value="insights" className="min-h-9">{t('insights')}</TabsTrigger>}
            </TabsList>
            {view !== 'insights' && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex gap-1 rounded-lg bg-muted p-1 shrink-0" role="group" aria-label={t('requesterFilter')}>
                  <Button size="sm" variant={mineOnly ? 'ghost' : 'secondary'} aria-pressed={!mineOnly} onClick={() => setMineOnly(false)} className="flex-1">{t('allRequests')}</Button>
                  <Button size="sm" variant={mineOnly ? 'secondary' : 'ghost'} aria-pressed={mineOnly} onClick={() => setMineOnly(true)} className="flex-1">{t('myRequests')}</Button>
                </div>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={event => setSearch(event.target.value)} placeholder={t('search')} aria-label={t('search')} className="pl-9" />
                </div>
              </div>
            )}
            {(['pending', 'history'] as const).map(tab => (
              <TabsContent value={tab} key={tab} className="space-y-3">
                {current.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-center">
                    <p className="font-medium">{search || mineOnly ? t('noMatches') : t(tab === 'pending' ? 'noPending' : 'noHistory')}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{t(tab === 'pending' ? 'pendingHint' : 'historyHint')}</p>
                    {(search || mineOnly) && <Button variant="link" onClick={() => { setSearch(''); setMineOnly(false); }}>{t('clearFilters')}</Button>}
                  </div>
                ) : current.map(request => (
                  <FoodRequestCard key={request.id} request={request} canCancel={request.requestedBy === userId} onCancel={() => onCancel(request.id)} onComplete={() => onComplete(request.id)} isCancelling={cancellingId === request.id} isCompleting={completingId === request.id} />
                ))}
              </TabsContent>
            ))}
            {isAdmin && <TabsContent value="insights" className="space-y-6">
              <MealSuggestions onRequestFood={onNewRequest} onViewRequests={name => { setSearch(name); setMineOnly(false); onViewChange('pending'); }} />
              <FoodRequestInsights requests={requests} userId={userId} canCreateRequests onRequestFood={onNewRequest} />
            </TabsContent>}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

function FoodRequestCard({ request, canCancel, onCancel, onComplete, isCancelling, isCompleting }: {
  request: FoodRequest; canCancel: boolean; onCancel: () => void; onComplete: () => void; isCancelling: boolean; isCompleting: boolean;
}) {
  const t = useTranslations('foodRequests');
  const format = useFormatter();
  const pending = request.status === 'pending';
  return (
    <article className={cn('rounded-lg border p-3 sm:p-4', pending && 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20')}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 break-words font-semibold">{request.foodName}</h3>
        <Badge variant={pending ? 'warning' : request.status === 'completed' ? 'success' : 'secondary'} className="shrink-0">{t(request.status)}</Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t('requestedBy', { name: request.requestedByUser?.fullName || t('unknown') })} · {format.dateTime(new Date(request.createdAt), { month: 'short', day: 'numeric', year: 'numeric' })}</p>
      {request.notes && <p className="mt-3 whitespace-pre-wrap break-words rounded-md bg-background/80 p-3 text-sm">{request.notes}</p>}
      {request.completedAt && <p className="mt-2 text-xs text-muted-foreground">{t('completedOn', { date: format.dateTime(new Date(request.completedAt), { month: 'short', day: 'numeric', year: 'numeric' }) })}</p>}
      {pending && <div className="mt-3 flex flex-wrap justify-end gap-2">
        {canCancel && <Button variant="outline" size="sm" onClick={onCancel} disabled={isCancelling || isCompleting}>{isCancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}{t('cancel')}</Button>}
        <Button variant="outline" size="sm" onClick={onComplete} disabled={isCancelling || isCompleting}>{isCompleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{t('complete')}</Button>
      </div>}
    </article>
  );
}
