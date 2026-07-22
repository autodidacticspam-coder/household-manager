'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Trash2, Copy } from 'lucide-react';
import { formatTime24h, formatTimeInput } from '@/lib/format-time';
import type { AvailabilityRange } from '@/types';

export type EditableRange = {
  start: string;
  startAmPm: 'AM' | 'PM';
  end: string;
  endAmPm: 'AM' | 'PM';
};

// Ranges being edited, keyed by day of week (0 = Sunday .. 6 = Saturday)
export type EditableWeek = Record<number, EditableRange[]>;

export function emptyWeek(): EditableWeek {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

export function defaultRange(): EditableRange {
  return { start: '9:00', startAmPm: 'AM', end: '5:00', endAmPm: 'PM' };
}

// Convert a stored 24h range to editor fields
export function rangeToEditable(range: AvailabilityRange): EditableRange {
  const to12 = (time: string): { value: string; amPm: 'AM' | 'PM' } => {
    const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
    return {
      value: `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')}`,
      amPm: hours >= 12 ? 'PM' : 'AM',
    };
  };
  const start = to12(range.startTime);
  const end = to12(range.endTime);
  return { start: start.value, startAmPm: start.amPm, end: end.value, endAmPm: end.amPm };
}

// Convert editor fields back to a 24h range; null if invalid or end <= start
export function editableToRange(range: EditableRange): AvailabilityRange | null {
  const startTime = formatTime24h(`${range.start} ${range.startAmPm}`);
  const endTime = formatTime24h(`${range.end} ${range.endAmPm}`);
  if (!startTime || !endTime || endTime <= startTime) return null;
  return { startTime, endTime };
}

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

type AvailabilityEditorProps = {
  value: EditableWeek;
  onChange: (value: EditableWeek) => void;
  dayLabels: readonly string[]; // 7 labels, Sunday first
  daySublabels?: readonly string[]; // optional date sublabels
};

export function AvailabilityEditor({ value, onChange, dayLabels, daySublabels }: AvailabilityEditorProps) {
  const t = useTranslations();

  const setDay = (day: number, ranges: EditableRange[]) => {
    onChange({ ...value, [day]: ranges });
  };

  const copyDayTo = (fromDay: number, targetDays: number[]) => {
    const next = { ...value };
    for (const target of targetDays) {
      if (target !== fromDay) {
        next[target] = value[fromDay].map((r) => ({ ...r }));
      }
    }
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {[0, 1, 2, 3, 4, 5, 6].map((day) => {
        const ranges = value[day] || [];
        const enabled = ranges.length > 0;

        return (
          <div key={day} className="flex items-start gap-3 border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
            <div className="flex items-center gap-2 w-32 shrink-0 pt-1.5">
              <Switch
                checked={enabled}
                onCheckedChange={(checked) => setDay(day, checked ? [defaultRange()] : [])}
              />
              <div className="min-w-0">
                <div className="font-medium text-sm">{dayLabels[day]}</div>
                {daySublabels && (
                  <div className="text-xs text-muted-foreground">{daySublabels[day]}</div>
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              {!enabled ? (
                <div className="text-sm text-muted-foreground pt-1.5">{t('babysitting.notAvailable')}</div>
              ) : (
                <div className="space-y-2">
                  {ranges.map((range, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={range.start}
                        onChange={(e) => {
                          const next = [...ranges];
                          next[i] = { ...range, start: formatTimeInput(e.target.value, range.start) };
                          setDay(day, next);
                        }}
                        className="w-16 h-8"
                        placeholder="9:00"
                      />
                      <AmPmToggle
                        value={range.startAmPm}
                        onChange={(amPm) => {
                          const next = [...ranges];
                          next[i] = { ...range, startAmPm: amPm };
                          setDay(day, next);
                        }}
                      />
                      <span className="text-muted-foreground text-sm">-</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={range.end}
                        onChange={(e) => {
                          const next = [...ranges];
                          next[i] = { ...range, end: formatTimeInput(e.target.value, range.end) };
                          setDay(day, next);
                        }}
                        className="w-16 h-8"
                        placeholder="5:00"
                      />
                      <AmPmToggle
                        value={range.endAmPm}
                        onChange={(amPm) => {
                          const next = [...ranges];
                          next[i] = { ...range, endAmPm: amPm };
                          setDay(day, next);
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDay(day, ranges.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground h-7 px-2"
                      onClick={() => setDay(day, [...ranges, defaultRange()])}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      {t('babysitting.addTime')}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-muted-foreground h-7 px-2">
                          <Copy className="h-3.5 w-3.5 mr-1" />
                          {t('babysitting.copyTo')}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => copyDayTo(day, [0, 1, 2, 3, 4, 5, 6])}>
                          {t('babysitting.copyAllDays')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyDayTo(day, [1, 2, 3, 4, 5])}>
                          {t('babysitting.copyWeekdays')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => copyDayTo(day, [0, 6])}>
                          {t('babysitting.copyWeekend')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
