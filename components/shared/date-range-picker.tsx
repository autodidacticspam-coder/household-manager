'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { format, subDays, subMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from 'date-fns';
import { parseLocalDate } from '@/lib/date-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from 'lucide-react';
import type { DateRange } from '@/types';

type DateRangePickerProps = {
  value: DateRange;
  onChange: (range: DateRange) => void;
};

type PresetKey = 'today' | 'yesterday' | 'last7days' | 'last14days' | 'last30days' | 'last90days' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'lastQuarter' | 'thisYear' | 'lastYear' | 'custom';

const getPresetDates = (preset: PresetKey): DateRange => {
  const today = new Date();

  switch (preset) {
    case 'today':
      return { startDate: format(today, 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd'), preset };
    case 'yesterday':
      const yesterday = subDays(today, 1);
      return { startDate: format(yesterday, 'yyyy-MM-dd'), endDate: format(yesterday, 'yyyy-MM-dd'), preset };
    case 'last7days':
      return { startDate: format(subDays(today, 6), 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd'), preset };
    case 'last14days':
      return { startDate: format(subDays(today, 13), 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd'), preset };
    case 'last30days':
      return { startDate: format(subDays(today, 29), 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd'), preset };
    case 'last90days':
      return { startDate: format(subDays(today, 89), 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd'), preset };
    case 'thisWeek':
      return { startDate: format(startOfWeek(today), 'yyyy-MM-dd'), endDate: format(endOfWeek(today), 'yyyy-MM-dd'), preset };
    case 'lastWeek':
      const lastWeek = subDays(today, 7);
      return { startDate: format(startOfWeek(lastWeek), 'yyyy-MM-dd'), endDate: format(endOfWeek(lastWeek), 'yyyy-MM-dd'), preset };
    case 'thisMonth':
      return { startDate: format(startOfMonth(today), 'yyyy-MM-dd'), endDate: format(endOfMonth(today), 'yyyy-MM-dd'), preset };
    case 'lastMonth':
      const lastMonth = subMonths(today, 1);
      return { startDate: format(startOfMonth(lastMonth), 'yyyy-MM-dd'), endDate: format(endOfMonth(lastMonth), 'yyyy-MM-dd'), preset };
    case 'thisQuarter':
      return { startDate: format(startOfQuarter(today), 'yyyy-MM-dd'), endDate: format(endOfQuarter(today), 'yyyy-MM-dd'), preset };
    case 'lastQuarter':
      const lastQuarter = subMonths(today, 3);
      return { startDate: format(startOfQuarter(lastQuarter), 'yyyy-MM-dd'), endDate: format(endOfQuarter(lastQuarter), 'yyyy-MM-dd'), preset };
    case 'thisYear':
      return { startDate: format(startOfYear(today), 'yyyy-MM-dd'), endDate: format(endOfYear(today), 'yyyy-MM-dd'), preset };
    case 'lastYear':
      const lastYear = subMonths(today, 12);
      return { startDate: format(startOfYear(lastYear), 'yyyy-MM-dd'), endDate: format(endOfYear(lastYear), 'yyyy-MM-dd'), preset };
    default:
      return { startDate: format(subDays(today, 29), 'yyyy-MM-dd'), endDate: format(today, 'yyyy-MM-dd'), preset: 'custom' };
  }
};

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [customStart, setCustomStart] = useState(value.startDate);
  const [customEnd, setCustomEnd] = useState(value.endDate);

  const handlePresetChange = (preset: string) => {
    if (preset === 'custom') {
      onChange({ ...value, preset: 'custom' });
    } else {
      const newRange = getPresetDates(preset as PresetKey);
      onChange(newRange);
      setCustomStart(newRange.startDate);
      setCustomEnd(newRange.endDate);
    }
  };

  const handleApplyCustom = () => {
    onChange({
      startDate: customStart,
      endDate: customEnd,
      preset: 'custom',
    });
    setOpen(false);
  };

  const displayText = value.preset === 'custom' && value.startDate && value.endDate
    ? `${format(parseLocalDate(value.startDate), 'MMM d, yyyy')} - ${format(parseLocalDate(value.endDate), 'MMM d, yyyy')}`
    : t(`reports.dateRange.presets.${value.preset || 'last30days'}`);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-start text-left font-normal">
          <Calendar className="mr-2 h-4 w-4" />
          {displayText}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div>
            <Label>{t('reports.dateRange.label')}</Label>
            <Select value={value.preset || 'custom'} onValueChange={handlePresetChange}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">{t('reports.dateRange.presets.today')}</SelectItem>
                <SelectItem value="yesterday">{t('reports.dateRange.presets.yesterday')}</SelectItem>
                <SelectItem value="last7days">{t('reports.dateRange.presets.last7days')}</SelectItem>
                <SelectItem value="last14days">{t('reports.dateRange.presets.last14days')}</SelectItem>
                <SelectItem value="last30days">{t('reports.dateRange.presets.last30days')}</SelectItem>
                <SelectItem value="last90days">{t('reports.dateRange.presets.last90days')}</SelectItem>
                <SelectItem value="thisWeek">{t('reports.dateRange.presets.thisWeek')}</SelectItem>
                <SelectItem value="lastWeek">{t('reports.dateRange.presets.lastWeek')}</SelectItem>
                <SelectItem value="thisMonth">{t('reports.dateRange.presets.thisMonth')}</SelectItem>
                <SelectItem value="lastMonth">{t('reports.dateRange.presets.lastMonth')}</SelectItem>
                <SelectItem value="thisQuarter">{t('reports.dateRange.presets.thisQuarter')}</SelectItem>
                <SelectItem value="lastQuarter">{t('reports.dateRange.presets.lastQuarter')}</SelectItem>
                <SelectItem value="thisYear">{t('reports.dateRange.presets.thisYear')}</SelectItem>
                <SelectItem value="lastYear">{t('reports.dateRange.presets.lastYear')}</SelectItem>
                <SelectItem value="custom">{t('reports.dateRange.custom')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(value.preset === 'custom' || true) && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('reports.dateRange.from')}</Label>
                <Input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>{t('reports.dateRange.to')}</Label>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={handleApplyCustom}>
              {t('reports.dateRange.apply')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
