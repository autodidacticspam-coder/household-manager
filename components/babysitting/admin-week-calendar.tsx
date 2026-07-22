'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { format, addDays } from 'date-fns';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { parseLocalDate } from '@/lib/date-utils';
import { cn } from '@/lib/utils';
import { useCalendarEvents } from '@/hooks/use-calendar';
import { getWeekDates } from '@/hooks/use-babysitting';
import type { BabysitterUser, BabysitterWeekAvailability, BookingRequest } from '@/types';

// Stable per-sitter colors (assigned by sorted order, same as the grid)
export const SITTER_COLORS = ['#ec4899', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4', '#f43f5e', '#84cc16', '#6366f1'];

const SHIFT_COLOR = '#94a3b8'; // same gray as the main calendar's shifts

type AdminWeekCalendarProps = {
  weekStart: string;
  availability: BabysitterWeekAvailability[];
  requests: BookingRequest[];
  onPickSlot: (user: BabysitterUser, date: string, startTime: string, endTime: string) => void;
};

export function AdminWeekCalendar({ weekStart, availability, requests, onPickSlot }: AdminWeekCalendarProps) {
  const t = useTranslations();
  const weekDates = getWeekDates(weekStart);
  const weekEnd = format(addDays(parseLocalDate(weekStart), 6), 'yyyy-MM-dd');

  // Real work shifts for ALL employees this week, assembled exactly like the
  // main calendar (recurring + overrides + one-offs, minus approved leave)
  const { data: calendarEvents, isLoading } = useCalendarEvents({
    startDate: weekStart,
    endDate: weekEnd,
    showTasks: false,
    showLeave: false,
    showSleep: false,
    showFood: false,
    showPoop: false,
    showShower: false,
    showImportantDates: false,
    showSchedules: true,
  });

  const shiftEvents = useMemo(
    () => (calendarEvents || []).filter((e) => e.type === 'schedule'),
    [calendarEvents]
  );

  const sitterColor = useMemo(() => {
    const map = new Map<string, string>();
    availability.forEach((a, i) => map.set(a.user.id, SITTER_COLORS[i % SITTER_COLORS.length]));
    return map;
  }, [availability]);

  // Everyone who appears in this view: babysitters + anyone with a shift
  const people = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string; isSitter: boolean }>();
    for (const a of availability) {
      map.set(a.user.id, {
        id: a.user.id,
        name: a.user.fullName,
        color: sitterColor.get(a.user.id) || SITTER_COLORS[0],
        isSitter: true,
      });
    }
    for (const e of shiftEvents) {
      const userId = e.extendedProps?.userId as string | undefined;
      const userName = (e.extendedProps?.userName as string | undefined) || e.title;
      if (userId && !map.has(userId)) {
        map.set(userId, { id: userId, name: userName, color: SHIFT_COLOR, isSitter: false });
      }
    }
    return [...map.values()].sort((a, b) => Number(b.isSitter) - Number(a.isSitter) || a.name.localeCompare(b.name));
  }, [availability, shiftEvents, sitterColor]);

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const togglePerson = (id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fcEvents = useMemo(() => {
    const events: object[] = [];

    // Actual shifts (gray, like the main calendar)
    for (const e of shiftEvents) {
      const userId = e.extendedProps?.userId as string | undefined;
      if (userId && hiddenIds.has(userId)) continue;
      events.push({
        id: e.id,
        title: e.title,
        start: e.start,
        end: e.end,
        backgroundColor: SHIFT_COLOR,
        borderColor: SHIFT_COLOR,
        classNames: ['bs-cal-shift'],
      });
    }

    // Babysitter availability (colored, semi-transparent; dashed = usual pattern)
    for (const a of availability) {
      if (hiddenIds.has(a.user.id)) continue;
      const color = sitterColor.get(a.user.id) || SITTER_COLORS[0];
      for (let dow = 0; dow < 7; dow++) {
        for (const range of a.days[dow] || []) {
          events.push({
            id: `avail-${a.user.id}-${dow}-${range.startTime}`,
            title: a.confirmed ? a.user.fullName : `${a.user.fullName} (${t('babysitting.usualBadge').toLowerCase()})`,
            start: `${weekDates[dow]}T${range.startTime}`,
            end: `${weekDates[dow]}T${range.endTime}`,
            backgroundColor: color,
            borderColor: color,
            classNames: ['bs-cal-avail', a.confirmed ? '' : 'bs-cal-usual'].filter(Boolean),
            extendedProps: {
              kind: 'availability',
              babysitterId: a.user.id,
              date: weekDates[dow],
              startTime: range.startTime,
              endTime: range.endTime,
            },
          });
        }
      }
    }

    // Pending (proposed) booking requests this week
    for (const r of requests) {
      if (r.status !== 'pending') continue;
      if (r.requestDate < weekStart || r.requestDate > weekEnd) continue;
      if (hiddenIds.has(r.babysitterId)) continue;
      events.push({
        id: `req-${r.id}`,
        title: `? ${r.babysitter?.fullName || ''} (${t('babysitting.proposed').toLowerCase()})`,
        start: `${r.requestDate}T${r.startTime}`,
        end: `${r.requestDate}T${r.endTime}`,
        backgroundColor: '#fde68a',
        borderColor: '#f59e0b',
        textColor: '#78350f',
        classNames: ['bs-cal-proposed'],
      });
    }

    return events;
  }, [shiftEvents, availability, requests, hiddenIds, sitterColor, weekDates, weekStart, weekEnd, t]);

  return (
    <div className="space-y-3">
      {/* Person filter chips (click to show/hide) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {people.map((person) => {
          const hidden = hiddenIds.has(person.id);
          return (
            <button
              key={person.id}
              type="button"
              onClick={() => togglePerson(person.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                hidden
                  ? 'bg-background text-muted-foreground/50 border-border'
                  : 'bg-accent/60 text-foreground border-transparent'
              )}
              title={t('babysitting.togglePersonHint')}
            >
              <span
                className={cn('h-2.5 w-2.5 rounded-full', hidden && 'opacity-30')}
                style={{ backgroundColor: person.color }}
              />
              <span className={cn(hidden && 'line-through')}>{person.name}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{t('babysitting.calendarHint')}</p>

      <div className={cn('bs-week-calendar', isLoading && 'opacity-60')}>
        <FullCalendar
          key={weekStart}
          plugins={[timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          initialDate={weekStart}
          headerToolbar={false}
          allDaySlot={false}
          height="auto"
          scrollTime="08:00:00"
          eventDisplay="block"
          events={fcEvents}
          eventClick={(info) => {
            const props = info.event.extendedProps as {
              kind?: string;
              babysitterId?: string;
              date?: string;
              startTime?: string;
              endTime?: string;
            };
            const sitter = availability.find((entry) => entry.user.id === props.babysitterId)?.user;
            if (props.kind === 'availability' && sitter && props.date && props.startTime && props.endTime) {
              // Let FullCalendar finish its click before mounting the Radix dialog.
              // Otherwise the originating click can be treated as an outside click
              // and dismiss the request dialog immediately.
              window.setTimeout(() => {
                onPickSlot(sitter, props.date!, props.startTime!, props.endTime!);
              }, 0);
            }
          }}
          eventTimeFormat={{
            hour: 'numeric',
            minute: '2-digit',
            meridiem: 'short',
          }}
        />
      </div>

      <style>{`
        .bs-week-calendar .bs-cal-avail {
          opacity: 0.75;
          cursor: pointer;
        }
        .bs-week-calendar .bs-cal-usual {
          opacity: 0.45;
          border-style: dashed !important;
        }
        .bs-week-calendar .bs-cal-proposed {
          border-style: dashed !important;
        }
        .bs-week-calendar .bs-cal-shift {
          opacity: 0.9;
        }
        .bs-week-calendar .fc-timegrid-event .fc-event-title {
          font-size: 0.7rem;
        }
      `}</style>
    </div>
  );
}
