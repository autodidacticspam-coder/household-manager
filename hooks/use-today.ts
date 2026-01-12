'use client';

import { useState } from 'react';
import { getTodayString, getStartOfMonthString } from '@/lib/date-utils';

/**
 * SSR-safe hook to get today's date string.
 * Uses lazy initialization to avoid hydration mismatch.
 */
export function useToday(): string {
  const [today] = useState(() =>
    typeof window !== 'undefined' ? getTodayString() : ''
  );

  return today;
}

/**
 * SSR-safe hook to get the start of current month.
 * Uses lazy initialization to avoid hydration mismatch.
 */
export function useStartOfMonth(): string {
  const [startOfMonth] = useState(() =>
    typeof window !== 'undefined' ? getStartOfMonthString() : ''
  );

  return startOfMonth;
}

/**
 * SSR-safe hook to get today's Date object.
 * Uses lazy initialization to avoid hydration mismatch.
 */
export function useTodayDate(): Date | null {
  const [today] = useState<Date | null>(() =>
    typeof window !== 'undefined' ? new Date() : null
  );

  return today;
}
