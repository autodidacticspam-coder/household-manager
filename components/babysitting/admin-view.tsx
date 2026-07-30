'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { format, addWeeks, getDay } from 'date-fns';
import { toast } from 'sonner';
import { parseLocalDate } from '@/lib/date-utils';
import { formatTime12h, formatTimeCompact } from '@/lib/format-time';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Loader2,
  Baby,
  Search,
  ChevronLeft,
  ChevronRight,
  Send,
  CheckCircle2,
  CircleSlash,
  CircleDot,
  CalendarClock,
  CalendarCheck,
  XCircle,
  LayoutList,
  CalendarDays,
  Hourglass,
  History,
} from 'lucide-react';
import { AdminWeekCalendar } from './admin-week-calendar';
import { AdminWeekOverview } from './admin-week-overview';
import type { AvailabilityRange, BabysitterUser, BookingRequest } from '@/types';
import {
  useBabysitters,
  useAdminBabysitterAvailability,
  useBabysitterShifts,
  useBookingRequests,
  useCreateBookingRequest,
  useRespondBookingRequest,
  getWeekStart,
} from '@/hooks/use-babysitting';

function rangesOverlap(a: AvailabilityRange, start: string, end: string): boolean {
  return a.startTime < end && a.endTime > start;
}

function rangeCovers(a: AvailabilityRange, start: string, end: string): boolean {
  return a.startTime <= start && a.endTime >= end;
}

type FinderResult = {
  user: BabysitterUser;
  status: 'available' | 'partial' | 'unavailable';
  ranges: AvailabilityRange[];
  conflicts: AvailabilityRange[];
  existingRequest: BookingRequest | undefined;
  confirmed: boolean;
};

function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

const STATUS_BADGES: Record<string, string> = {
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-700',
};

const TIME_RE = /^\d{2}:\d{2}$/;

function RequestSummary({ request }: { request: BookingRequest }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={request.babysitter?.avatarUrl || undefined} />
        <AvatarFallback>{initials(request.babysitter?.fullName || '?')}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="text-sm font-medium">
          {request.babysitter?.fullName}
          <span className="font-normal text-muted-foreground">
            {' '}&middot; {format(parseLocalDate(request.requestDate), 'EEE, MMM d')}{' '}
            &middot; {formatTime12h(request.startTime)} - {formatTime12h(request.endTime)}
          </span>
        </div>
        {request.note && (
          <div className="truncate text-xs italic text-muted-foreground">&ldquo;{request.note}&rdquo;</div>
        )}
      </div>
    </div>
  );
}

export function AdminBabysittingView() {
  const t = useTranslations();

  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // Finder state (times are 24h "HH:mm", straight from native time inputs)
  const [finderDate, setFinderDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [finderStart, setFinderStart] = useState('17:00');
  const [finderEnd, setFinderEnd] = useState('21:00');

  const [requestDialog, setRequestDialog] = useState<{ user: BabysitterUser } | null>(null);
  const [requestNote, setRequestNote] = useState('');
  const [cancelDialog, setCancelDialog] = useState<BookingRequest | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { data: sitters, isLoading: sittersLoading } = useBabysitters();
  const sitterIds = useMemo(() => (sitters || []).map((s) => s.id), [sitters]);

  const { data: weekAvailability, isLoading: weekLoading } = useAdminBabysitterAvailability(weekStart);
  const { data: weekShifts, isLoading: weekShiftsLoading } = useBabysitterShifts(weekStart, sitterIds);
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const finderWeekStart = useMemo(() => getWeekStart(parseLocalDate(finderDate)), [finderDate]);
  const { data: finderAvailability } = useAdminBabysitterAvailability(finderWeekStart);
  const { data: finderShifts } = useBabysitterShifts(finderWeekStart, sitterIds);

  const { data: requests, isLoading: requestsLoading } = useBookingRequests();
  const createRequest = useCreateBookingRequest();
  const respond = useRespondBookingRequest();

  const queryValid = TIME_RE.test(finderStart) && TIME_RE.test(finderEnd) && finderEnd > finderStart;

  const finderResults: FinderResult[] = useMemo(() => {
    if (!queryValid || !finderAvailability) return [];
    const dow = getDay(parseLocalDate(finderDate));

    const results: FinderResult[] = finderAvailability.map((sitterAvailability) => {
      const ranges = sitterAvailability.days[dow] || [];
      const covered = ranges.some((r) => rangeCovers(r, finderStart, finderEnd));
      const overlapping = ranges.filter((r) => rangesOverlap(r, finderStart, finderEnd));
      const conflicts = (finderShifts?.[`${sitterAvailability.user.id}|${finderDate}`] || [])
        .filter((s) => rangesOverlap(s, finderStart, finderEnd));
      const existingRequest = (requests || []).find(
        (r) =>
          r.babysitterId === sitterAvailability.user.id &&
          r.requestDate === finderDate &&
          ['pending', 'accepted'].includes(r.status) &&
          rangesOverlap({ startTime: r.startTime, endTime: r.endTime }, finderStart, finderEnd)
      );
      return {
        user: sitterAvailability.user,
        status: covered ? 'available' as const : overlapping.length > 0 ? 'partial' as const : 'unavailable' as const,
        ranges: overlapping.length > 0 ? overlapping : ranges,
        conflicts,
        existingRequest,
        confirmed: sitterAvailability.confirmed,
      };
    });

    const order = { available: 0, partial: 1, unavailable: 2 };
    return results.sort((a, b) => order[a.status] - order[b.status] || a.user.fullName.localeCompare(b.user.fullName));
  }, [queryValid, finderStart, finderEnd, finderAvailability, finderShifts, finderDate, requests]);

  const prefillFinder = (date: string, start24: string, end24: string) => {
    setFinderDate(date);
    setFinderStart(start24.slice(0, 5));
    setFinderEnd(end24.slice(0, 5));
  };

  const openRequestForSlot = (
    user: BabysitterUser,
    date: string,
    start24: string,
    end24: string
  ) => {
    if (weekShiftsLoading) {
      toast.info(t('common.loading'));
      return;
    }

    const existingRequest = (requests || []).find(
      (request) =>
        request.babysitterId === user.id &&
        request.requestDate === date &&
        ['pending', 'accepted'].includes(request.status) &&
        rangesOverlap({ startTime: request.startTime, endTime: request.endTime }, start24, end24)
    );
    if (existingRequest) {
      toast.error(t('babysitting.requestAlreadyExists', {
        name: user.fullName,
        status: t(`babysitting.status_${existingRequest.status}`).toLowerCase(),
      }));
      return;
    }

    const conflicts = (weekShifts?.[`${user.id}|${date}`] || [])
      .filter((shift) => rangesOverlap(shift, start24, end24));
    if (conflicts.length > 0) {
      toast.error(t('babysitting.alreadyScheduled', {
        time: conflicts.map((shift) => `${formatTimeCompact(shift.startTime)} - ${formatTimeCompact(shift.endTime)}`).join(', '),
      }));
      return;
    }

    prefillFinder(date, start24, end24);
    setRequestDialog({ user });
  };

  const handleSendRequest = () => {
    if (!requestDialog || !queryValid) return;
    createRequest.mutate(
      {
        babysitterId: requestDialog.user.id,
        requestDate: finderDate,
        startTime: finderStart,
        endTime: finderEnd,
        note: requestNote.trim() || undefined,
      },
      {
        onSuccess: () => {
          setRequestDialog(null);
          setRequestNote('');
        },
      }
    );
  };

  const handleCancelShift = () => {
    if (!cancelDialog) return;
    respond.mutate(
      { id: cancelDialog.id, action: 'cancel' },
      { onSuccess: () => setCancelDialog(null) }
    );
  };

  const pendingRequests = (requests || [])
    .filter((r) => r.status === 'pending')
    .sort((a, b) => a.requestDate.localeCompare(b.requestDate) || a.startTime.localeCompare(b.startTime));
  const upcomingBookings = (requests || [])
    .filter((r) => r.status === 'accepted' && r.requestDate >= todayStr)
    .sort((a, b) => a.requestDate.localeCompare(b.requestDate) || a.startTime.localeCompare(b.startTime));
  const upcomingIds = new Set(upcomingBookings.map((r) => r.id));
  const historyRequests = (requests || [])
    .filter((r) => r.status !== 'pending' && !upcomingIds.has(r.id))
    .slice(0, 10);

  if (sittersLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Baby className="h-6 w-6" />
          {t('babysitting.adminTitle')}
        </h1>
        <p className="text-muted-foreground">{t('babysitting.adminSubtitle')}</p>
      </div>

      {(sitters || []).length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t('babysitting.noBabysitters')}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Requests waiting on a sitter's reply */}
          {pendingRequests.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/40">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Hourglass className="h-4 w-4 text-amber-600" />
                  {t('babysitting.awaitingReply')}
                  <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                    {pendingRequests.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pendingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background/80 px-3 py-2"
                  >
                    <RequestSummary request={request} />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 text-muted-foreground hover:text-destructive"
                      disabled={respond.isPending}
                      onClick={() => respond.mutate({ id: request.id, action: 'cancel' })}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      {t('common.cancel')}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Week overview: bookings + remaining free time per day */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarClock className="h-5 w-5" />
                    {t('babysitting.weekOverview')}
                  </CardTitle>
                  <CardDescription className="mt-1">{t('babysitting.weekOverviewHint')}</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <div className="mr-1 flex overflow-hidden rounded-lg border">
                    <button
                      type="button"
                      onClick={() => setViewMode('list')}
                      className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                      }`}
                    >
                      <LayoutList className="h-3.5 w-3.5" />
                      {t('babysitting.viewGrid')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('calendar')}
                      className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        viewMode === 'calendar' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                      }`}
                    >
                      <CalendarDays className="h-3.5 w-3.5" />
                      {t('babysitting.viewCalendar')}
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setWeekStart(format(addWeeks(parseLocalDate(weekStart), -1), 'yyyy-MM-dd'))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setWeekStart(getWeekStart(new Date()))}>
                    {t('common.today')}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setWeekStart(format(addWeeks(parseLocalDate(weekStart), 1), 'yyyy-MM-dd'))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {viewMode === 'calendar' ? (
                <AdminWeekCalendar
                  weekStart={weekStart}
                  availability={weekAvailability || []}
                  requests={requests || []}
                  onPickSlot={openRequestForSlot}
                />
              ) : weekLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <AdminWeekOverview
                  weekStart={weekStart}
                  availability={weekAvailability || []}
                  shifts={weekShifts}
                  shiftsLoading={weekShiftsLoading}
                  requests={requests || []}
                  onBookSlot={openRequestForSlot}
                  onCancelBooking={setCancelDialog}
                />
              )}
            </CardContent>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
            {/* Find a babysitter for a specific time */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  {t('babysitting.findHelp')}
                </CardTitle>
                <CardDescription>{t('babysitting.findHelpHint')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="finder-date">{t('common.date')}</Label>
                    <Input
                      id="finder-date"
                      type="date"
                      value={finderDate}
                      onChange={(e) => e.target.value && setFinderDate(e.target.value)}
                      className="h-11 w-40 sm:h-10"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="finder-start">{t('babysitting.from')}</Label>
                    <Input
                      id="finder-start"
                      type="time"
                      value={finderStart}
                      onChange={(e) => setFinderStart(e.target.value)}
                      className="h-11 w-28 tabular-nums sm:h-10 [&::-webkit-calendar-picker-indicator]:hidden"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="finder-end">{t('babysitting.to')}</Label>
                    <Input
                      id="finder-end"
                      type="time"
                      value={finderEnd}
                      onChange={(e) => setFinderEnd(e.target.value)}
                      className="h-11 w-28 tabular-nums sm:h-10 [&::-webkit-calendar-picker-indicator]:hidden"
                    />
                  </div>
                  <div className="pb-2 text-sm text-muted-foreground">
                    {format(parseLocalDate(finderDate), 'EEEE, MMM d')}
                  </div>
                </div>

                {!queryValid ? (
                  <p className="text-sm text-muted-foreground">{t('babysitting.enterValidTimes')}</p>
                ) : (
                  <div className="space-y-2">
                    {finderResults.map((result) => (
                      <div
                        key={result.user.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-accent/50 px-3 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={result.user.avatarUrl || undefined} />
                            <AvatarFallback>{initials(result.user.fullName)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                              {result.user.fullName}
                              {result.status === 'available' && (
                                <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  {t('babysitting.available')}
                                </Badge>
                              )}
                              {result.status === 'partial' && (
                                <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                                  <CircleDot className="h-3 w-3 mr-1" />
                                  {t('babysitting.partiallyAvailable')}
                                </Badge>
                              )}
                              {result.status === 'unavailable' && (
                                <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                                  <CircleSlash className="h-3 w-3 mr-1" />
                                  {t('babysitting.unavailable')}
                                </Badge>
                              )}
                              {!result.confirmed && result.status !== 'unavailable' && (
                                <span className="text-xs text-muted-foreground">({t('babysitting.usingUsual')})</span>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {result.ranges.length > 0
                                ? result.ranges.map((r) => `${formatTimeCompact(r.startTime)} - ${formatTimeCompact(r.endTime)}`).join(', ')
                                : t('babysitting.notAvailable')}
                            </div>
                            {result.conflicts.length > 0 && (
                              <div className="mt-0.5 text-xs text-red-600">
                                <CalendarClock className="mr-1 inline h-3 w-3" />
                                {t('babysitting.alreadyScheduled', {
                                  time: result.conflicts.map((c) => `${formatTimeCompact(c.startTime)} - ${formatTimeCompact(c.endTime)}`).join(', '),
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          {result.existingRequest ? (
                            <Badge variant="secondary" className={STATUS_BADGES[result.existingRequest.status]}>
                              {t(`babysitting.status_${result.existingRequest.status}`)}
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              className="h-9"
                              disabled={result.status === 'unavailable' || result.conflicts.length > 0}
                              onClick={() => setRequestDialog({ user: result.user })}
                            >
                              <Send className="h-3.5 w-3.5 mr-1" />
                              {t('babysitting.sendRequest')}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Confirmed upcoming babysitting + history */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarCheck className="h-5 w-5" />
                  {t('babysitting.upcomingSchedule')}
                  {upcomingBookings.length > 0 && (
                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                      {upcomingBookings.length}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>{t('babysitting.upcomingBookingsHint')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {requestsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    {upcomingBookings.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t('babysitting.noUpcomingShifts')}</p>
                    ) : (
                      upcomingBookings.map((request) => (
                        <div
                          key={request.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50/60 px-3 py-2"
                        >
                          <RequestSummary request={request} />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 text-muted-foreground hover:text-destructive"
                            disabled={respond.isPending}
                            onClick={() => setCancelDialog(request)}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                            {t('babysitting.cancelShift')}
                          </Button>
                        </div>
                      ))
                    )}

                    {historyRequests.length > 0 && (
                      <div className="pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 px-2 text-muted-foreground"
                          onClick={() => setShowHistory((v) => !v)}
                        >
                          <History className="h-3.5 w-3.5 mr-1" />
                          {showHistory ? t('babysitting.hideHistory') : t('babysitting.showHistory')}
                          {!showHistory && <span className="ml-1">({historyRequests.length})</span>}
                        </Button>
                        {showHistory && (
                          <div className="mt-2 space-y-2">
                            {historyRequests.map((request) => (
                              <div
                                key={request.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-accent/40 px-3 py-2"
                              >
                                <RequestSummary request={request} />
                                <Badge variant="secondary" className={STATUS_BADGES[request.status]}>
                                  {t(`babysitting.status_${request.status}`)}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Send request dialog */}
      <Dialog
        open={!!requestDialog}
        onOpenChange={(open) => {
          if (!open) {
            setRequestDialog(null);
            setRequestNote('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {requestDialog && t('babysitting.requestDialogTitle', { name: requestDialog.user.fullName })}
            </DialogTitle>
            <DialogDescription>
              {format(parseLocalDate(finderDate), 'EEEE, MMM d')}
              {queryValid && (
                <> &middot; {formatTime12h(finderStart)} - {formatTime12h(finderEnd)}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="request-note">{t('babysitting.noteLabel')}</Label>
            <Textarea
              id="request-note"
              value={requestNote}
              onChange={(e) => setRequestNote(e.target.value)}
              placeholder={t('babysitting.notePlaceholder')}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRequestDialog(null);
                setRequestNote('');
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSendRequest} disabled={createRequest.isPending}>
              {createRequest.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Send className="h-3.5 w-3.5 mr-1" />
              {t('babysitting.sendRequest')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel an accepted booking and its linked schedule shift */}
      <Dialog open={!!cancelDialog} onOpenChange={(open) => !open && setCancelDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('babysitting.cancelShiftTitle')}</DialogTitle>
            <DialogDescription>
              {cancelDialog && t('babysitting.cancelShiftDescription', {
                name: cancelDialog.babysitter?.fullName || '',
                date: format(parseLocalDate(cancelDialog.requestDate), 'EEEE, MMM d'),
                time: `${formatTime12h(cancelDialog.startTime)} - ${formatTime12h(cancelDialog.endTime)}`,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(null)}>
              {t('common.back')}
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleCancelShift}
              disabled={respond.isPending}
            >
              {respond.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('babysitting.cancelShift')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
