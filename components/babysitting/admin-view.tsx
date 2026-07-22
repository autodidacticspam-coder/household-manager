'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { format, addWeeks, getDay } from 'date-fns';
import { toast } from 'sonner';
import { parseLocalDate } from '@/lib/date-utils';
import { formatTime24h, formatTimeInput, formatTime12h } from '@/lib/format-time';
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
  XCircle,
  LayoutGrid,
  CalendarDays,
} from 'lucide-react';
import { AdminWeekCalendar, SITTER_COLORS } from './admin-week-calendar';
import { DAYS_OF_WEEK_SHORT } from '@/types';
import type { AvailabilityRange, BabysitterUser, BookingRequest } from '@/types';
import {
  useBabysitters,
  useAdminBabysitterAvailability,
  useBabysitterShifts,
  useBookingRequests,
  useCreateBookingRequest,
  useRespondBookingRequest,
  getWeekStart,
  getWeekDates,
} from '@/hooks/use-babysitting';

// "9 AM" / "9:30 AM" — compact for grid chips
function compactTime(time: string): string {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return minutes === 0 ? `${h12} ${period}` : `${h12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

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

function AmPmToggle({ value, onChange }: { value: 'AM' | 'PM'; onChange: (v: 'AM' | 'PM') => void }) {
  return (
    <div className="flex rounded-lg border overflow-hidden shrink-0">
      {(['AM', 'PM'] as const).map((period) => (
        <button
          key={period}
          type="button"
          onClick={() => onChange(period)}
          className={`px-2 py-1 text-xs font-semibold transition-colors ${
            value === period
              ? 'bg-primary text-primary-foreground'
              : 'bg-background hover:bg-muted'
          }`}
        >
          {period}
        </button>
      ))}
    </div>
  );
}

function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

const STATUS_BADGES: Record<string, string> = {
  accepted: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-700',
};

export function AdminBabysittingView() {
  const t = useTranslations();

  // Availability grid week
  const [gridWeekStart, setGridWeekStart] = useState(() => getWeekStart(new Date()));
  const [viewMode, setViewMode] = useState<'grid' | 'calendar'>('grid');

  // Finder state
  const [finderDate, setFinderDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('5:00');
  const [startAmPm, setStartAmPm] = useState<'AM' | 'PM'>('PM');
  const [endTime, setEndTime] = useState('9:00');
  const [endAmPm, setEndAmPm] = useState<'AM' | 'PM'>('PM');

  // Request dialog
  const [requestDialog, setRequestDialog] = useState<{ user: BabysitterUser } | null>(null);
  const [requestNote, setRequestNote] = useState('');
  const [cancelDialog, setCancelDialog] = useState<BookingRequest | null>(null);

  const { data: sitters, isLoading: sittersLoading } = useBabysitters();
  const sitterIds = useMemo(() => (sitters || []).map((s) => s.id), [sitters]);

  const { data: gridAvailability, isLoading: gridLoading } = useAdminBabysitterAvailability(gridWeekStart);
  const { data: gridShifts, isLoading: gridShiftsLoading } = useBabysitterShifts(gridWeekStart, sitterIds);
  const gridDates = getWeekDates(gridWeekStart);
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const finderWeekStart = useMemo(() => getWeekStart(parseLocalDate(finderDate)), [finderDate]);
  const { data: finderAvailability } = useAdminBabysitterAvailability(finderWeekStart);
  const { data: finderShifts } = useBabysitterShifts(finderWeekStart, sitterIds);

  const { data: requests, isLoading: requestsLoading } = useBookingRequests();
  const createRequest = useCreateBookingRequest();
  const respond = useRespondBookingRequest();

  const queryStart = formatTime24h(`${startTime} ${startAmPm}`);
  const queryEnd = formatTime24h(`${endTime} ${endAmPm}`);
  const queryValid = !!queryStart && !!queryEnd && queryEnd > queryStart;

  const finderResults: FinderResult[] = useMemo(() => {
    if (!queryValid || !finderAvailability) return [];
    const dow = getDay(parseLocalDate(finderDate));

    const results: FinderResult[] = finderAvailability.map((sitterAvailability) => {
      const ranges = sitterAvailability.days[dow] || [];
      const covered = ranges.some((r) => rangeCovers(r, queryStart!, queryEnd!));
      const overlapping = ranges.filter((r) => rangesOverlap(r, queryStart!, queryEnd!));
      const conflicts = (finderShifts?.[`${sitterAvailability.user.id}|${finderDate}`] || [])
        .filter((s) => rangesOverlap(s, queryStart!, queryEnd!));
      const existingRequest = (requests || []).find(
        (r) =>
          r.babysitterId === sitterAvailability.user.id &&
          r.requestDate === finderDate &&
          ['pending', 'accepted'].includes(r.status) &&
          rangesOverlap({ startTime: r.startTime, endTime: r.endTime }, queryStart!, queryEnd!)
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
  }, [queryValid, queryStart, queryEnd, finderAvailability, finderShifts, finderDate, requests]);

  // Load a clicked availability block into the finder
  const prefillFinder = (date: string, start24: string, end24: string) => {
    const to12 = (time: string): { value: string; amPm: 'AM' | 'PM' } => {
      const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
      return {
        value: `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')}`,
        amPm: hours >= 12 ? 'PM' : 'AM',
      };
    };
    setFinderDate(date);
    const s = to12(start24);
    setStartTime(s.value);
    setStartAmPm(s.amPm);
    const e = to12(end24);
    setEndTime(e.value);
    setEndAmPm(e.amPm);
  };

  const openRequestForSlot = (
    user: BabysitterUser,
    date: string,
    start24: string,
    end24: string
  ) => {
    if (gridShiftsLoading) {
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

    const conflicts = (gridShifts?.[`${user.id}|${date}`] || [])
      .filter((shift) => rangesOverlap(shift, start24, end24));
    if (conflicts.length > 0) {
      toast.error(t('babysitting.alreadyScheduled', {
        time: conflicts.map((shift) => `${compactTime(shift.startTime)} - ${compactTime(shift.endTime)}`).join(', '),
      }));
      return;
    }

    prefillFinder(date, start24, end24);
    setRequestDialog({ user });
  };

  const handleSendRequest = () => {
    if (!requestDialog || !queryStart || !queryEnd) return;
    createRequest.mutate(
      {
        babysitterId: requestDialog.user.id,
        requestDate: finderDate,
        startTime: queryStart,
        endTime: queryEnd,
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

  const pendingRequests = (requests || []).filter((r) => r.status === 'pending');
  const upcomingAcceptedRequests = (requests || [])
    .filter((r) => r.status === 'accepted' && r.requestDate >= todayStr)
    .sort((a, b) => a.requestDate.localeCompare(b.requestDate) || a.startTime.localeCompare(b.startTime));
  const upcomingAcceptedIds = new Set(upcomingAcceptedRequests.map((r) => r.id));
  const pastRequests = (requests || [])
    .filter((r) => r.status !== 'pending' && !upcomingAcceptedIds.has(r.id))
    .slice(0, 10);
  const displayedRequests = [...pendingRequests, ...upcomingAcceptedRequests, ...pastRequests];

  if (sittersLoading) {
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
          {/* Find a babysitter */}
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
                    className="w-40"
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t('babysitting.from')}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={startTime}
                      onChange={(e) => setStartTime(formatTimeInput(e.target.value, startTime))}
                      className="w-16"
                      placeholder="5:00"
                    />
                    <AmPmToggle value={startAmPm} onChange={setStartAmPm} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>{t('babysitting.to')}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={endTime}
                      onChange={(e) => setEndTime(formatTimeInput(e.target.value, endTime))}
                      className="w-16"
                      placeholder="9:00"
                    />
                    <AmPmToggle value={endAmPm} onChange={setEndAmPm} />
                  </div>
                </div>
                <div className="text-sm text-muted-foreground pb-2">
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
                      className="flex flex-wrap items-center justify-between gap-3 bg-accent/50 rounded-lg px-4 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={result.user.avatarUrl || undefined} />
                          <AvatarFallback>{initials(result.user.fullName)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
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
                              ? result.ranges.map((r) => `${compactTime(r.startTime)} - ${compactTime(r.endTime)}`).join(', ')
                              : t('babysitting.notAvailable')}
                          </div>
                          {result.conflicts.length > 0 && (
                            <div className="text-xs text-red-600 mt-0.5">
                              <CalendarClock className="h-3 w-3 inline mr-1" />
                              {t('babysitting.alreadyScheduled', {
                                time: result.conflicts.map((c) => `${compactTime(c.startTime)} - ${compactTime(c.endTime)}`).join(', '),
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

          {/* Week availability grid */}
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
                <div className="flex items-center gap-1 flex-wrap">
                  <div className="flex rounded-lg border overflow-hidden mr-1">
                    <button
                      type="button"
                      onClick={() => setViewMode('grid')}
                      className={`px-2.5 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1 ${
                        viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                      }`}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      {t('babysitting.viewGrid')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('calendar')}
                      className={`px-2.5 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1 ${
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
                    onClick={() => setGridWeekStart(format(addWeeks(parseLocalDate(gridWeekStart), -1), 'yyyy-MM-dd'))}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setGridWeekStart(getWeekStart(new Date()))}>
                    {t('common.today')}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setGridWeekStart(format(addWeeks(parseLocalDate(gridWeekStart), 1), 'yyyy-MM-dd'))}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {viewMode === 'calendar' ? (
                <AdminWeekCalendar
                  weekStart={gridWeekStart}
                  availability={gridAvailability || []}
                  requests={requests || []}
                  onPickSlot={openRequestForSlot}
                />
              ) : gridLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-separate border-spacing-0">
                    <thead>
                      <tr>
                        <th className="text-left font-medium text-muted-foreground p-2 min-w-36" />
                        {gridDates.map((date, dow) => (
                          <th
                            key={date}
                            className={`text-center font-medium p-2 min-w-24 cursor-pointer hover:bg-accent rounded-t-lg ${
                              date === todayStr ? 'text-primary' : 'text-muted-foreground'
                            }`}
                            onClick={() => setFinderDate(date)}
                            title={t('babysitting.clickToSearch')}
                          >
                            <div>{DAYS_OF_WEEK_SHORT[dow]}</div>
                            <div className={`text-xs ${date === todayStr ? 'font-bold' : 'font-normal'}`}>
                              {format(parseLocalDate(date), 'MMM d')}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(gridAvailability || []).map((sitterAvailability, sitterIndex) => (
                        <tr key={sitterAvailability.user.id} className="border-t">
                          <td className="p-2 align-top">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={sitterAvailability.user.avatarUrl || undefined} />
                                <AvatarFallback>{initials(sitterAvailability.user.fullName)}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0">
                                <div className="font-medium truncate flex items-center gap-1.5">
                                  <span
                                    className="h-2 w-2 rounded-full shrink-0"
                                    style={{ backgroundColor: SITTER_COLORS[sitterIndex % SITTER_COLORS.length] }}
                                  />
                                  {sitterAvailability.user.fullName}
                                </div>
                                <Badge
                                  variant="secondary"
                                  className={`text-[10px] px-1.5 py-0 ${
                                    sitterAvailability.confirmed
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-100 text-gray-600'
                                  }`}
                                >
                                  {sitterAvailability.confirmed
                                    ? t('babysitting.confirmedBadge')
                                    : t('babysitting.usualBadge')}
                                </Badge>
                              </div>
                            </div>
                          </td>
                          {gridDates.map((date, dow) => {
                            const ranges = sitterAvailability.days[dow] || [];
                            return (
                              <td
                                key={date}
                                className={`p-1.5 align-top text-center cursor-pointer hover:bg-accent/50 ${
                                  date === todayStr ? 'bg-primary/5' : ''
                                }`}
                                onClick={() => setFinderDate(date)}
                              >
                                {ranges.length === 0 ? (
                                  <span className="text-muted-foreground/40">&mdash;</span>
                                ) : (
                                  <div className="space-y-1">
                                    {ranges.map((range, i) => (
                                      <button
                                        key={i}
                                        type="button"
                                        disabled={gridShiftsLoading}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          openRequestForSlot(
                                            sitterAvailability.user,
                                            date,
                                            range.startTime,
                                            range.endTime
                                          );
                                        }}
                                        title={t('babysitting.clickToRequest', { name: sitterAvailability.user.fullName })}
                                        className={`w-full text-xs rounded-md px-1.5 py-1 whitespace-nowrap transition-colors disabled:cursor-wait ${
                                          sitterAvailability.confirmed
                                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                      >
                                        {compactTime(range.startTime)} - {compactTime(range.endTime)}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Requests */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                {t('babysitting.requests')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {requestsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : displayedRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('babysitting.noRequests')}</p>
              ) : (
                <>
                  {displayedRequests.map((request) => (
                    <div
                      key={request.id}
                      className="flex flex-wrap items-center justify-between gap-3 bg-accent/50 rounded-lg px-4 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={request.babysitter?.avatarUrl || undefined} />
                          <AvatarFallback>{initials(request.babysitter?.fullName || '?')}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium text-sm">
                            {request.babysitter?.fullName}
                            <span className="text-muted-foreground font-normal">
                              {' '}&middot; {format(parseLocalDate(request.requestDate), 'EEE, MMM d')}{' '}
                              &middot; {formatTime12h(request.startTime)} - {formatTime12h(request.endTime)}
                            </span>
                          </div>
                          {request.note && (
                            <div className="text-xs text-muted-foreground italic">&ldquo;{request.note}&rdquo;</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className={STATUS_BADGES[request.status]}>
                          {t(`babysitting.status_${request.status}`)}
                        </Badge>
                        {request.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            disabled={respond.isPending}
                            onClick={() => respond.mutate({ id: request.id, action: 'cancel' })}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                            {t('common.cancel')}
                          </Button>
                        )}
                        {request.status === 'accepted' && request.requestDate >= todayStr && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            disabled={respond.isPending}
                            onClick={() => setCancelDialog(request)}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                            {t('babysitting.cancelShift')}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
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
              {queryStart && queryEnd && (
                <> &middot; {formatTime12h(queryStart)} - {formatTime12h(queryEnd)}</>
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
