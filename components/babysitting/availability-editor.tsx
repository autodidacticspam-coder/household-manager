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
import type { AvailabilityRange } from '@/types';

// Times are 24h "HH:mm" strings, matching native <input type="time"> values.
// Phones open their built-in time picker for these, which shows 12h AM/PM
// (or whatever the device is set to) without needing separate toggles.
export type EditableRange = {
  start: string;
  end: string;
};

// Ranges being edited, keyed by day of week (0 = Sunday .. 6 = Saturday)
export type EditableWeek = Record<number, EditableRange[]>;

export function emptyWeek(): EditableWeek {
  return { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
}

export function defaultRange(): EditableRange {
  return { start: '09:00', end: '17:00' };
}

// Convert a stored range ("HH:mm" or "HH:mm:ss") to editor fields
export function rangeToEditable(range: AvailabilityRange): EditableRange {
  return { start: range.startTime.slice(0, 5), end: range.endTime.slice(0, 5) };
}

// Convert editor fields back to a range; null if incomplete or end <= start
export function editableToRange(range: EditableRange): AvailabilityRange | null {
  if (!/^\d{2}:\d{2}$/.test(range.start) || !/^\d{2}:\d{2}$/.test(range.end)) return null;
  if (range.end <= range.start) return null;
  return { startTime: range.start, endTime: range.end };
}

function TimeField({
  value,
  onChange,
  invalid,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  label: string;
}) {
  return (
    <Input
      type="time"
      value={value}
      aria-label={label}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className="h-11 min-w-0 flex-1 px-2 text-center tabular-nums sm:h-10 sm:max-w-36 [&::-webkit-date-and-time-value]:text-center [&::-webkit-calendar-picker-indicator]:hidden sm:[&::-webkit-calendar-picker-indicator]:inline-block"
    />
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
    <div>
      {[0, 1, 2, 3, 4, 5, 6].map((day) => {
        const ranges = value[day] || [];
        const enabled = ranges.length > 0;

        return (
          <div key={day} className="border-b border-border/50 py-3 first:pt-0 last:border-b-0 last:pb-0">
            {/* Day header: the whole label is the tap target for the switch */}
            <div className="flex min-h-9 items-center justify-between gap-3">
              <label className="-my-1 flex cursor-pointer select-none items-center gap-3 py-2 pr-2">
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) => setDay(day, checked ? [defaultRange()] : [])}
                />
                <span className="text-sm font-medium">
                  {dayLabels[day]}
                  {daySublabels && (
                    <span className="ml-1.5 font-normal text-muted-foreground">{daySublabels[day]}</span>
                  )}
                </span>
              </label>
              {!enabled && (
                <span className="text-sm text-muted-foreground">{t('babysitting.notAvailable')}</span>
              )}
            </div>

            {enabled && (
              <div className="mt-2 space-y-2">
                {ranges.map((range, i) => {
                  const invalid = !editableToRange(range);
                  const bothFilled = range.start !== '' && range.end !== '';
                  return (
                    <div key={i}>
                      <div className="flex items-center gap-2">
                        <TimeField
                          value={range.start}
                          invalid={invalid}
                          label={t('babysitting.from')}
                          onChange={(start) => {
                            const next = [...ranges];
                            next[i] = { ...range, start };
                            setDay(day, next);
                          }}
                        />
                        <span className="shrink-0 text-muted-foreground">&ndash;</span>
                        <TimeField
                          value={range.end}
                          invalid={invalid}
                          label={t('babysitting.to')}
                          onChange={(end) => {
                            const next = [...ranges];
                            next[i] = { ...range, end };
                            setDay(day, next);
                          }}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={t('common.delete')}
                          onClick={() => setDay(day, ranges.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {invalid && bothFilled && (
                        <p className="mt-1 text-xs text-destructive">{t('babysitting.endAfterStart')}</p>
                      )}
                    </div>
                  );
                })}
                <div className="flex items-center gap-2 pt-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2.5 text-muted-foreground"
                    onClick={() => setDay(day, [...ranges, defaultRange()])}
                  >
                    <Plus className="h-4 w-4" />
                    {t('babysitting.addTime')}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-9 px-2.5 text-muted-foreground">
                        <Copy className="h-4 w-4" />
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
        );
      })}
    </div>
  );
}
