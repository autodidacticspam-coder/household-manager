'use client';

import { useState, useEffect } from 'react';
import { getTodayString, getStartOfMonthString } from '@/lib/date-utils';

/**
 * SSR-safe hook to get today's date string.
 * Returns empty string during SSR, then updates to actual date on client.
 */
export function useToday(): string {
  const [today, setToday] = useState('');

  useEffect(() => {
    setToday(getTodayString());
  }, []);

  return today;
}

/**
 * SSR-safe hook to get the start of current month.
 * Returns empty string during SSR, then updates to actual date on client.
 */
export function useStartOfMonth(): string {
  const [startOfMonth, setStartOfMonth] = useState('');

  useEffect(() => {
    setStartOfMonth(getStartOfMonthString());
  }, []);

  return startOfMonth;
}

/**
 * SSR-safe hook to get today's Date object.
 * Returns null during SSR, then updates to actual Date on client.
 */
export function useTodayDate(): Date | null {
  const [today, setToday] = useState<Date | null>(null);

  useEffect(() => {
    setToday(new Date());
  }, []);

  return today;
}
