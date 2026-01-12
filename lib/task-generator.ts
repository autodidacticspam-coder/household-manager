/**
 * Task Generator Utility
 * Generates dates for repeating tasks based on selected days and interval
 */

import {
  addDays,
  addWeeks,
  addMonths,
  getDay,
  getDate,
  isBefore,
  isAfter,
} from 'date-fns';
import { parseLocalDate, formatDateString } from './date-utils';

export type RepeatInterval = 'weekly' | 'biweekly' | 'monthly' | null;

export type TaskGenerationInput = {
  /** Days of week to create tasks (0=Sunday, 1=Monday, ..., 6=Saturday) */
  selectedDays: number[];
  /** Repeat interval */
  repeatInterval: RepeatInterval;
  /** Start date (YYYY-MM-DD) - first possible date for tasks */
  startDate: string;
  /** End date (YYYY-MM-DD) - last possible date for tasks */
  endDate: string;
};

/**
 * Get the week number of month for a given date (1-5)
 * e.g., Jan 1 could be week 1, Jan 8 could be week 2, etc.
 */
function getWeekOfMonth(date: Date): number {
  const dayOfMonth = getDate(date);
  return Math.ceil(dayOfMonth / 7);
}

/**
 * Find the nth occurrence of a weekday in a month
 * e.g., find the 2nd Tuesday of the month
 */
function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date | null {
  const firstDayOfMonth = new Date(year, month, 1);
  let date = firstDayOfMonth;
  let count = 0;

  // Find first occurrence of the weekday
  while (getDay(date) !== weekday) {
    date = addDays(date, 1);
  }

  // Count to nth occurrence
  count = 1;
  while (count < n) {
    date = addDays(date, 7);
    count++;
    // Check if we've gone past the month
    if (date.getMonth() !== month) {
      return null; // This occurrence doesn't exist in this month
    }
  }

  // Final check that we're still in the same month
  if (date.getMonth() !== month) {
    return null;
  }

  return date;
}

/**
 * Generate all task dates based on the repeat pattern
 */
export function generateTaskDates(input: TaskGenerationInput): string[] {
  const { selectedDays, repeatInterval, startDate, endDate } = input;

  if (selectedDays.length === 0) {
    return [];
  }

  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);

  if (isAfter(start, end)) {
    return [];
  }

  const dates: string[] = [];

  if (!repeatInterval) {
    // No repeat - just return the start date if it matches a selected day
    const startDayOfWeek = getDay(start);
    if (selectedDays.includes(startDayOfWeek)) {
      dates.push(formatDateString(start));
    }
    return dates;
  }

  if (repeatInterval === 'weekly') {
    // Generate weekly tasks for each selected day
    let currentWeekStart = start;

    while (!isAfter(currentWeekStart, end)) {
      for (const dayOfWeek of selectedDays) {
        // Find the day in the current week
        const daysUntilTarget = (dayOfWeek - getDay(currentWeekStart) + 7) % 7;
        const targetDate = addDays(currentWeekStart, daysUntilTarget);

        // Check if within range
        if (!isBefore(targetDate, start) && !isAfter(targetDate, end)) {
          dates.push(formatDateString(targetDate));
        }
      }
      currentWeekStart = addWeeks(currentWeekStart, 1);
    }
  } else if (repeatInterval === 'biweekly') {
    // Generate bi-weekly tasks for each selected day
    let currentWeekStart = start;
    let weekCount = 0;

    while (!isAfter(currentWeekStart, end)) {
      // Only process every other week
      if (weekCount % 2 === 0) {
        for (const dayOfWeek of selectedDays) {
          const daysUntilTarget = (dayOfWeek - getDay(currentWeekStart) + 7) % 7;
          const targetDate = addDays(currentWeekStart, daysUntilTarget);

          if (!isBefore(targetDate, start) && !isAfter(targetDate, end)) {
            dates.push(formatDateString(targetDate));
          }
        }
      }
      currentWeekStart = addWeeks(currentWeekStart, 1);
      weekCount++;
    }
  } else if (repeatInterval === 'monthly') {
    // Monthly = same week/day pattern (e.g., 2nd Tuesday of every month)
    // For each selected day, find which week of month the start date falls on
    // Then generate the same week/day for each subsequent month

    for (const dayOfWeek of selectedDays) {
      // Find the first occurrence of this day on or after start date
      let firstOccurrence = start;
      while (getDay(firstOccurrence) !== dayOfWeek) {
        firstOccurrence = addDays(firstOccurrence, 1);
      }

      if (isAfter(firstOccurrence, end)) {
        continue; // This day doesn't occur within the range
      }

      // Determine which week of the month this falls on
      const weekOfMonth = getWeekOfMonth(firstOccurrence);

      // Generate for each month
      let currentMonth = new Date(firstOccurrence.getFullYear(), firstOccurrence.getMonth(), 1);

      while (!isAfter(currentMonth, end)) {
        const targetDate = getNthWeekdayOfMonth(
          currentMonth.getFullYear(),
          currentMonth.getMonth(),
          dayOfWeek,
          weekOfMonth
        );

        if (targetDate && !isBefore(targetDate, start) && !isAfter(targetDate, end)) {
          dates.push(formatDateString(targetDate));
        }

        currentMonth = addMonths(currentMonth, 1);
      }
    }
  }

  // Sort dates and remove duplicates
  const uniqueDates = [...new Set(dates)].sort();

  return uniqueDates;
}

/**
 * Get a human-readable description of the repeat pattern
 */
export function getRepeatDescription(
  selectedDays: number[],
  repeatInterval: RepeatInterval
): string {
  if (!repeatInterval || selectedDays.length === 0) {
    return '';
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const selectedDayNames = selectedDays
    .sort((a, b) => a - b)
    .map((d) => dayNames[d])
    .join(', ');

  const intervalText =
    repeatInterval === 'weekly'
      ? 'every week'
      : repeatInterval === 'biweekly'
        ? 'every 2 weeks'
        : 'monthly (same week pattern)';

  return `Repeats ${intervalText} on ${selectedDayNames}`;
}
