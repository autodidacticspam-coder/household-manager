'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ScrollText } from 'lucide-react';
import { useBookingRequestLog, type BookingLogFilter } from '@/hooks/use-babysitting';
import { RequestSummary, STATUS_BADGES } from './request-summary';

const PAGE_SIZE = 25;
const FILTERS: BookingLogFilter[] = ['all', 'pending', 'accepted', 'declined', 'cancelled'];

// "Jul 30" this year, "Jul 30, 2025" otherwise
function formatLogDate(iso: string): string {
  const date = new Date(iso);
  return format(date, date.getFullYear() === new Date().getFullYear() ? 'MMM d' : 'MMM d, yyyy');
}

export function RequestLogCard() {
  const t = useTranslations();
  const [filter, setFilter] = useState<BookingLogFilter>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { data, isLoading } = useBookingRequestLog(filter, limit);

  const requests = data?.requests || [];
  const total = data?.total ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="h-5 w-5" />
          {t('babysitting.requestLog')}
          {total > 0 && <Badge variant="secondary">{total}</Badge>}
        </CardTitle>
        <CardDescription>{t('babysitting.requestLogHint')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setFilter(value);
                setLimit(PAGE_SIZE);
              }}
              className={cn(
                'h-8 rounded-full border px-3 text-xs font-medium transition-colors',
                filter === value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background hover:bg-muted'
              )}
            >
              {value === 'all' ? t('common.all') : t(`babysitting.status_${value}`)}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('babysitting.noRequests')}</p>
        ) : (
          <>
            <div className="space-y-2">
              {requests.map((request) => (
                <div
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-accent/40 px-3 py-2"
                >
                  <RequestSummary
                    request={request}
                    meta={
                      <>
                        {t('babysitting.asked', { date: formatLogDate(request.createdAt) })}
                        {request.respondedAt ? (
                          <> &middot; {t('babysitting.replied', { date: formatLogDate(request.respondedAt) })}</>
                        ) : request.status === 'pending' ? (
                          <> &middot; {t('babysitting.noReplyYet')}</>
                        ) : null}
                      </>
                    }
                  />
                  <Badge variant="secondary" className={STATUS_BADGES[request.status]}>
                    {t(`babysitting.status_${request.status}`)}
                  </Badge>
                </div>
              ))}
            </div>
            {requests.length < total && (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-muted-foreground"
                  onClick={() => setLimit((current) => current + PAGE_SIZE)}
                >
                  {t('babysitting.showMore')} ({total - requests.length})
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
