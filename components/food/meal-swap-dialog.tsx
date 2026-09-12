'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { addDays } from 'date-fns';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDateFormat } from '@/hooks/use-date-format';
import { useMenuSlotLabel, useSwapMenuMeals } from '@/hooks/use-menu-swap';
import { MENU_DAYS, MENU_MEAL_TYPES, isSameMenuSlot, type MenuSlot } from '@/lib/validators/menu-swap';
import type { DayMeals } from '@/types';
import { cn } from '@/lib/utils';

type Props = {
  source: MenuSlot;
  meals: DayMeals[];
  weekStart: string;
  weekStartDate: Date;
  menuUpdatedAt: string | null;
  onClose: () => void;
};

export function MealSwapDialog({ source, meals, weekStart, weekStartDate, menuUpdatedAt, onClose }: Props) {
  const t = useTranslations('menuSwap');
  const tMenu = useTranslations('menu');
  const formatDate = useDateFormat();
  const label = useMenuSlotLabel();
  const [day, setDay] = useState(source.day);
  const [error, setError] = useState<string | null>(null);
  const swap = useSwapMenuMeals(weekStart);
  const selectedDay = meals.find(dayMeals => dayMeals.day === day);
  const sourceContent = meals.find(dayMeals => dayMeals.day === source.day)?.[source.mealType]?.trim() || '';

  async function choose(target: MenuSlot) {
    if (swap.isPending || isSameMenuSlot(source, target)) return;
    setError(null);
    try {
      const result = await swap.mutateAsync({ from: source, to: target, expectedUpdatedAt: menuUpdatedAt });
      if ('error' in result) setError(result.error);
      else onClose();
    } catch {
      setError(t('swapFailed'));
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open && !swap.isPending) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto" showCloseButton={!swap.isPending}>
        <DialogHeader>
          <DialogTitle>{t('title', { slot: label(source) })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <p className="whitespace-pre-wrap break-words rounded-md border bg-muted/40 px-3 py-2 text-sm">{sourceContent}</p>
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">{t('day')}</p>
          <div className="grid grid-cols-7 gap-1">
            {MENU_DAYS.map((name, index) => {
              const date = addDays(weekStartDate, index);
              const active = day === name;
              return (
                <button key={name} type="button" aria-pressed={active} aria-label={tMenu(`days.${name.toLowerCase()}`)}
                  disabled={swap.isPending} onClick={() => setDay(name)}
                  className={cn(
                    'rounded-md border px-1 py-1.5 text-center text-xs leading-tight transition-colors touch-manipulation disabled:opacity-50',
                    active ? 'border-amber-600 bg-amber-600 text-white' : 'bg-background hover:bg-accent',
                  )}>
                  <span className="block font-medium">{formatDate(date, 'EEE')}</span>
                  <span className="block text-[11px] opacity-80">{formatDate(date, 'd')}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-2" role="group" aria-label={tMenu(`days.${day.toLowerCase()}`)}>
          {MENU_MEAL_TYPES.map(mealType => {
            const target = { day, mealType };
            const isSource = isSameMenuSlot(source, target);
            const lines = (selectedDay?.[mealType] || '').split('\n').map(line => line.trim()).filter(Boolean);
            return (
              <button key={mealType} type="button" disabled={isSource || swap.isPending} onClick={() => void choose(target)}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors touch-manipulation disabled:cursor-not-allowed',
                  isSource ? 'border-dashed opacity-60' : 'bg-background hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 disabled:opacity-50',
                )}>
                <span className="flex w-full items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                  {tMenu(`meals.${mealType}`)}
                  {isSource && <span className="font-normal normal-case tracking-normal text-muted-foreground">· {t('thisMeal')}</span>}
                </span>
                <span className={cn('w-full truncate text-sm', lines.length === 0 && 'italic text-muted-foreground')}>
                  {lines.length === 0 ? t('empty') : lines[0]}
                  {lines.length > 1 && <span className="text-muted-foreground"> {t('moreLines', { count: lines.length - 1 })}</span>}
                </span>
              </button>
            );
          })}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="sm:justify-between">
          <span className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
            {swap.isPending && <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t('swapping')}</>}
          </span>
          <Button type="button" variant="outline" onClick={onClose} disabled={swap.isPending}>{t('cancel')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
