'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { format, addWeeks, addDays } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/auth-context';
import { parseLocalDate } from '@/lib/date-utils';
import { formatTime12h } from '@/lib/format-time';
import { getZonedParts } from '@/lib/timezone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, CalendarHeart, CalendarClock, Clock, Check, X, Pencil, RotateCcw, Inbox } from 'lucide-react';
import { DAYS_OF_WEEK } from '@/types';
import type { BookingRequest } from '@/types';
import {
  useBookingRequests,
  useRespondBookingRequest,
  useMyAvailabilityTemplate,
  useSaveAvailabilityTemplate,
  useMyWeekAvailability,
  useSaveWeekAvailability,
  useResetWeekAvailability,
  getWeekStart,
  getWeekDates,
} from '@/hooks/use-babysitting';
import {
  AvailabilityEditor,
  emptyWeek,
  rangeToEditable,
  editableToRange,
  type EditableWeek,
} from './availability-editor';

function formatDateLabel(dateStr: string): string {
  return format(parseLocalDate(dateStr), 'EEE, MMM d');
}

function weekLabel(weekStart: string): string {
  const start = parseLocalDate(weekStart);
  return `${format(start, 'MMM d')} - ${format(addDays(start, 6), 'MMM d')}`;
}

// Convert valid editor ranges for a week into per-date entries
function editableWeekToEntries(edit: EditableWeek, weekStart: string): { entryDate: string; startTime: string; endTime: string }[] | null {
  const weekDates = getWeekDates(weekStart);
  const entries: { entryDate: string; startTime: string; endTime: string }[] = [];
  for (let day = 0; day < 7; day++) {
    for (const editable of edit[day] || []) {
      const range = editableToRange(editable);
      if (!range) return null;
      entries.push({ entryDate: weekDates[day], startTime: range.startTime, endTime: range.endTime });
    }
  }
  return entries;
}

function RequestCard({ request, onRespond, isPending }: {
  request: BookingRequest;
  onRespond: (id: string, action: 'accept' | 'decline') => void;
  isPending: boolean;
}) {
  const t = useTranslations();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-accent/50 rounded-lg px-4 py-3">
      <div>
        <div className="font-medium text-sm">
          {formatDateLabel(request.requestDate)}
        </div>
        <div className="text-sm text-muted-foreground">
          {formatTime12h(request.startTime)} - {formatTime12h(request.endTime)}
        </div>
        {request.note && (
          <div className="text-sm text-muted-foreground mt-1 italic">&ldquo;{request.note}&rdquo;</div>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="bg-green-600 hover:bg-green-700"
          disabled={isPending}
          onClick={() => onRespond(request.id, 'accept')}
        >
          <Check className="h-4 w-4 mr-1" />
          {t('babysitting.accept')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => onRespond(request.id, 'decline')}
        >
          <X className="h-4 w-4 mr-1" />
          {t('babysitting.decline')}
        </Button>
      </div>
    </div>
  );
}

const STATUS_BADGES: Record<string, string> = {
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-700',
};

export function BabysitterView() {
  const t = useTranslations();
  const { user } = useAuth();
  const userId = user?.id;

  const { data: requests, isLoading: requestsLoading } = useBookingRequests();
  const respond = useRespondBookingRequest();

  const { data: template, isLoading: templateLoading } = useMyAvailabilityTemplate(userId);
  const saveTemplate = useSaveAvailabilityTemplate();

  // The editor shows the saved template until the user starts editing
  const templateFromData = useMemo(() => {
    if (!template) return null;
    const edit = emptyWeek();
    for (const slot of template) {
      edit[slot.dayOfWeek] = [...edit[slot.dayOfWeek], rangeToEditable(slot)];
    }
    return edit;
  }, [template]);
  const [templateDraft, setTemplateDraft] = useState<EditableWeek | null>(null);
  const templateEdit = templateDraft ?? templateFromData;

  const weekStarts = useMemo(() => {
    const current = getWeekStart(new Date());
    return [0, 1, 2, 3].map((i) => format(addWeeks(parseLocalDate(current), i), 'yyyy-MM-dd'));
  }, []);
  const { data: weekData } = useMyWeekAvailability(userId, weekStarts);
  const saveWeek = useSaveWeekAvailability();
  const resetWeek = useResetWeekAvailability();
  const [weekDialog, setWeekDialog] = useState<{ weekStart: string; edit: EditableWeek } | null>(null);

  const pendingRequests = (requests || []).filter((r) => r.status === 'pending');
  const now = getZonedParts(new Date());
  const currentTime = now.time.slice(0, 5);
  const upcomingSchedule = (requests || [])
    .filter((request) =>
      request.status === 'accepted' &&
      (request.requestDate > now.date ||
        (request.requestDate === now.date && request.endTime > currentTime))
    )
    .sort((a, b) =>
      a.requestDate.localeCompare(b.requestDate) || a.startTime.localeCompare(b.startTime)
    );
  const upcomingScheduleIds = new Set(upcomingSchedule.map((request) => request.id));
  const respondedRequests = (requests || [])
    .filter((request) => request.status !== 'pending' && !upcomingScheduleIds.has(request.id))
    .slice(0, 5);

  const handleSaveTemplate = () => {
    if (!userId || !templateEdit) return;
    const slots: { dayOfWeek: number; startTime: string; endTime: string }[] = [];
    for (let day = 0; day < 7; day++) {
      for (const editable of templateEdit[day] || []) {
        const range = editableToRange(editable);
        if (!range) {
          toast.error(t('babysitting.invalidTimes'));
          return;
        }
        slots.push({ dayOfWeek: day, startTime: range.startTime, endTime: range.endTime });
      }
    }
    saveTemplate.mutate({ userId, slots });
  };

  const openWeekDialog = (weekStart: string) => {
    const confirmed = (weekData?.weeks || []).some((w) => w.weekStart === weekStart);
    const edit = emptyWeek();
    if (confirmed) {
      const weekDates = getWeekDates(weekStart);
      for (const entry of weekData?.entries || []) {
        const day = weekDates.indexOf(entry.entryDate);
        if (day >= 0) {
          edit[day] = [...edit[day], rangeToEditable(entry)];
        }
      }
    } else if (templateEdit) {
      for (let day = 0; day < 7; day++) {
        edit[day] = (templateEdit[day] || []).map((r) => ({ ...r }));
      }
    }
    setWeekDialog({ weekStart, edit });
  };

  const handleSaveWeek = () => {
    if (!userId || !weekDialog) return;
    const entries = editableWeekToEntries(weekDialog.edit, weekDialog.weekStart);
    if (!entries) {
      toast.error(t('babysitting.invalidTimes'));
      return;
    }
    saveWeek.mutate(
      { userId, weekStart: weekDialog.weekStart, entries },
      { onSuccess: () => setWeekDialog(null) }
    );
  };

  if (requestsLoading || templateLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CalendarHeart className="h-6 w-6" />
          {t('babysitting.myAvailabilityTitle')}
        </h1>
        <p className="text-muted-foreground">{t('babysitting.mySubtitle')}</p>
      </div>

      {/* Booking requests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-5 w-5" />
            {t('babysitting.requests')}
            {pendingRequests.length > 0 && (
              <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{pendingRequests.length}</Badge>
            )}
          </CardTitle>
          <CardDescription>{t('babysitting.requestsHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('babysitting.noPendingRequests')}</p>
          ) : (
            pendingRequests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                isPending={respond.isPending}
                onRespond={(id, action) => respond.mutate({ id, action })}
              />
            ))
          )}
          {respondedRequests.length > 0 && (
            <div className="pt-2 space-y-2">
              {respondedRequests.map((request) => (
                <div key={request.id} className="flex items-center justify-between text-sm text-muted-foreground px-4">
                  <span>
                    {formatDateLabel(request.requestDate)} &middot; {formatTime12h(request.startTime)} - {formatTime12h(request.endTime)}
                  </span>
                  <Badge variant="secondary" className={STATUS_BADGES[request.status]}>
                    {t(`babysitting.status_${request.status}`)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Accepted babysitting shifts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            {t('babysitting.upcomingSchedule')}
            {upcomingSchedule.length > 0 && (
              <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                {upcomingSchedule.length}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>{t('babysitting.upcomingScheduleHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcomingSchedule.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('babysitting.noUpcomingShifts')}</p>
          ) : (
            upcomingSchedule.map((request) => (
              <div
                key={request.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50/60 px-4 py-3"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2 font-medium text-sm">
                    <span>{formatDateLabel(request.requestDate)}</span>
                    {request.requestDate === now.date && (
                      <Badge variant="secondary">{t('common.today')}</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatTime12h(request.startTime)} - {formatTime12h(request.endTime)}
                  </div>
                  {request.note && (
                    <div className="text-sm text-muted-foreground mt-1 italic">
                      &ldquo;{request.note}&rdquo;
                    </div>
                  )}
                </div>
                <Badge variant="secondary" className={STATUS_BADGES.accepted}>
                  {t('babysitting.status_accepted')}
                </Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Upcoming weeks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t('babysitting.upcomingWeeks')}
          </CardTitle>
          <CardDescription>{t('babysitting.upcomingWeeksHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {weekStarts.map((weekStart, i) => {
            const confirmed = (weekData?.weeks || []).some((w) => w.weekStart === weekStart);
            return (
              <div key={weekStart} className="flex flex-wrap items-center justify-between gap-2 bg-accent/50 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{weekLabel(weekStart)}</span>
                  {i === 0 && <Badge variant="secondary">{t('common.thisWeek')}</Badge>}
                  <Badge
                    variant="secondary"
                    className={confirmed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}
                  >
                    {confirmed ? t('babysitting.customized') : t('babysitting.usingUsual')}
                  </Badge>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openWeekDialog(weekStart)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    {t('babysitting.adjust')}
                  </Button>
                  {confirmed && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      disabled={resetWeek.isPending}
                      onClick={() => resetWeek.mutate({ userId: userId!, weekStart })}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      {t('babysitting.resetToUsual')}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Usual weekly availability */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarHeart className="h-5 w-5" />
            {t('babysitting.usualSchedule')}
          </CardTitle>
          <CardDescription>{t('babysitting.usualScheduleHint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {templateEdit && (
            <AvailabilityEditor
              value={templateEdit}
              onChange={setTemplateDraft}
              dayLabels={DAYS_OF_WEEK}
            />
          )}
          <Button onClick={handleSaveTemplate} disabled={saveTemplate.isPending}>
            {saveTemplate.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('common.save')}
          </Button>
        </CardContent>
      </Card>

      {/* Adjust-week dialog */}
      <Dialog open={!!weekDialog} onOpenChange={(open) => !open && setWeekDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {weekDialog && t('babysitting.adjustWeekTitle', { week: weekLabel(weekDialog.weekStart) })}
            </DialogTitle>
          </DialogHeader>
          {weekDialog && (
            <AvailabilityEditor
              value={weekDialog.edit}
              onChange={(edit) => setWeekDialog({ ...weekDialog, edit })}
              dayLabels={DAYS_OF_WEEK}
              daySublabels={getWeekDates(weekDialog.weekStart).map((d) => format(parseLocalDate(d), 'MMM d'))}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setWeekDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveWeek} disabled={saveWeek.isPending}>
              {saveWeek.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
