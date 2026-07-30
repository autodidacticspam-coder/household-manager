'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/date-utils';
import { formatTimeCompact } from '@/lib/format-time';
import { subtractRanges, rangeMinutes } from '@/lib/time-ranges';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, Hourglass, BriefcaseBusiness, Plus } from 'lucide-react';
import { getWeekDates } from '@/hooks/use-babysitting';
import type {
  AvailabilityRange,
  BabysitterUser,
  BabysitterWeekAvailability,
  BookingRequest,
} from '@/types';

// A booked-solid chunk of a sitter's day, or the free time left around them
type Chip = {
  kind: 'booked' | 'pending' | 'work' | 'free';
  startTime: string;
  endTime: string;
  request?: BookingRequest;
  confirmed?: boolean;
};

// Free slivers shorter than this aren't worth booking, so don't show them
const MIN_FREE_MINUTES = 30;

function buildChips(
  availableRanges: AvailabilityRange[],
  shifts: AvailabilityRange[],
  dayRequests: BookingRequest[],
  confirmed: boolean,
  includeFree: boolean
): Chip[] {
  const accepted = dayRequests.filter((r) => r.status === 'accepted');
  const pending = dayRequests.filter((r) => r.status === 'pending');
  const matchedRequestIds = new Set<string>();
  const chips: Chip[] = [];

  // A shift that lines up with an accepted booking request IS that booking;
  // any other shift is the sitter's regular work schedule
  for (const shift of shifts) {
    const booking = accepted.find(
      (r) =>
        !matchedRequestIds.has(r.id) &&
        r.startTime === shift.startTime &&
        r.endTime === shift.endTime
    );
    if (booking) {
      matchedRequestIds.add(booking.id);
      chips.push({ kind: 'booked', startTime: shift.startTime, endTime: shift.endTime, request: booking });
    } else {
      chips.push({ kind: 'work', startTime: shift.startTime, endTime: shift.endTime });
    }
  }
  for (const request of accepted) {
    if (!matchedRequestIds.has(request.id)) {
      chips.push({ kind: 'booked', startTime: request.startTime, endTime: request.endTime, request });
    }
  }
  for (const request of pending) {
    chips.push({ kind: 'pending', startTime: request.startTime, endTime: request.endTime, request });
  }

  if (includeFree) {
    const taken = chips.map((c) => ({ startTime: c.startTime, endTime: c.endTime }));
    for (const range of subtractRanges(availableRanges, taken)) {
      if (rangeMinutes(range) >= MIN_FREE_MINUTES) {
        chips.push({ kind: 'free', ...range, confirmed });
      }
    }
  }

  return chips.sort(
    (a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime)
  );
}

const CHIP_STYLES: Record<Chip['kind'], string> = {
  booked: 'bg-green-100 text-green-800',
  pending: 'bg-amber-100 text-amber-800',
  work: 'bg-slate-100 text-slate-500',
  free: 'border-primary/50 text-primary bg-background',
};

const CHIP_ICONS: Record<Chip['kind'], React.ReactNode> = {
  booked: <CheckCircle2 className="h-3 w-3 shrink-0" />,
  pending: <Hourglass className="h-3 w-3 shrink-0" />,
  work: <BriefcaseBusiness className="h-3 w-3 shrink-0" />,
  free: <Plus className="h-3 w-3 shrink-0" />,
};

function SlotChip({
  chip,
  onClick,
  title,
}: {
  chip: Pick<Chip, 'kind' | 'confirmed'> & Partial<Chip>;
  onClick?: () => void;
  title?: string;
}) {
  const label =
    chip.startTime && chip.endTime
      ? `${formatTimeCompact(chip.startTime)} - ${formatTimeCompact(chip.endTime)}`
      : null;
  const className = cn(
    'inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium',
    chip.kind === 'free' && 'border',
    chip.kind === 'free' && chip.confirmed === false && 'border-dashed',
    CHIP_STYLES[chip.kind],
    onClick && 'cursor-pointer transition-colors',
    onClick && chip.kind === 'free' && 'hover:bg-primary/10',
    onClick && chip.kind === 'booked' && 'hover:bg-green-200'
  );

  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} title={title}>
        {CHIP_ICONS[chip.kind]}
        {label}
      </button>
    );
  }
  return (
    <span className={className} title={title}>
      {CHIP_ICONS[chip.kind]}
      {label}
    </span>
  );
}

function initials(name: string): string {
  return name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
}

type AdminWeekOverviewProps = {
  weekStart: string;
  availability: BabysitterWeekAvailability[];
  shifts: Record<string, AvailabilityRange[]> | undefined;
  shiftsLoading: boolean;
  requests: BookingRequest[];
  onBookSlot: (user: BabysitterUser, date: string, startTime: string, endTime: string) => void;
  onCancelBooking: (request: BookingRequest) => void;
};

export function AdminWeekOverview({
  weekStart,
  availability,
  shifts,
  shiftsLoading,
  requests,
  onBookSlot,
  onCancelBooking,
}: AdminWeekOverviewProps) {
  const t = useTranslations();
  const dates = getWeekDates(weekStart);
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const requestsByKey = useMemo(() => {
    const map = new Map<string, BookingRequest[]>();
    for (const request of requests) {
      if (!['pending', 'accepted'].includes(request.status)) continue;
      const key = `${request.babysitterId}|${request.requestDate}`;
      map.set(key, [...(map.get(key) || []), request]);
    }
    return map;
  }, [requests]);

  if (shiftsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // In the current week, days that already passed are no longer actionable
  const visibleDates = dates.filter(
    (date) => !(dates.includes(todayStr) && date < todayStr)
  );

  return (
    <div>
      <div className="divide-y divide-border/60">
        {visibleDates.map((date) => {
          const dow = parseLocalDate(date).getDay();
          const isToday = date === todayStr;
          const isPast = date < todayStr;

          const lines = availability
            .map((sitter) => ({
              user: sitter.user,
              chips: buildChips(
                sitter.days[dow] || [],
                shifts?.[`${sitter.user.id}|${date}`] || [],
                requestsByKey.get(`${sitter.user.id}|${date}`) || [],
                sitter.confirmed,
                !isPast
              ),
            }))
            // A line with only regular work shifts says nothing about babysitting
            .filter((line) => line.chips.some((chip) => chip.kind !== 'work'));

          return (
            <div key={date} className="py-2.5 first:pt-0 last:pb-0 sm:grid sm:grid-cols-[6.5rem_1fr] sm:gap-3">
              <div className="flex items-center gap-2 sm:block sm:pt-1">
                <div className={cn('text-sm font-medium', isToday && 'text-primary')}>
                  {format(parseLocalDate(date), 'EEE, MMM d')}
                </div>
                {isToday && (
                  <Badge variant="secondary" className="bg-primary/10 text-primary sm:mt-1">
                    {t('common.today')}
                  </Badge>
                )}
              </div>

              {lines.length === 0 ? (
                <div className="mt-1 text-sm text-muted-foreground/70 sm:mt-0 sm:pt-1.5">
                  {t('babysitting.nobodyAvailable')}
                </div>
              ) : (
                <div className="mt-1.5 space-y-1.5 sm:mt-0">
                  {lines.map((line) => (
                    <div key={line.user.id} className="flex items-start gap-1.5">
                      <div className="flex w-24 shrink-0 items-center gap-1.5 pt-0.5">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={line.user.avatarUrl || undefined} />
                          <AvatarFallback className="text-[10px]">{initials(line.user.fullName)}</AvatarFallback>
                        </Avatar>
                        <span className="truncate text-sm">{line.user.fullName.split(' ')[0]}</span>
                      </div>
                      <div className="flex flex-1 flex-wrap gap-1.5">
                      {line.chips.map((chip, i) => {
                        if (chip.kind === 'free') {
                          return (
                            <SlotChip
                              key={i}
                              chip={chip}
                              title={t('babysitting.clickToRequest', { name: line.user.fullName })}
                              onClick={() => onBookSlot(line.user, date, chip.startTime, chip.endTime)}
                            />
                          );
                        }
                        if (chip.kind === 'booked' && chip.request && !isPast) {
                          const request = chip.request;
                          return (
                            <SlotChip
                              key={i}
                              chip={chip}
                              title={t('babysitting.cancelShift')}
                              onClick={() => onCancelBooking(request)}
                            />
                          );
                        }
                        return (
                          <SlotChip
                            key={i}
                            chip={chip}
                            title={
                              chip.kind === 'work'
                                ? t('babysitting.working')
                                : chip.kind === 'pending'
                                  ? t('babysitting.status_pending')
                                  : undefined
                            }
                          />
                        );
                      })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <SlotChip chip={{ kind: 'booked' }} />
          {t('babysitting.booked')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <SlotChip chip={{ kind: 'pending' }} />
          {t('babysitting.status_pending')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <SlotChip chip={{ kind: 'work' }} />
          {t('babysitting.working')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <SlotChip chip={{ kind: 'free', confirmed: true }} />
          {t('babysitting.tapToBook')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <SlotChip chip={{ kind: 'free', confirmed: false }} />
          {t('babysitting.usingUsual')}
        </span>
      </div>
    </div>
  );
}
