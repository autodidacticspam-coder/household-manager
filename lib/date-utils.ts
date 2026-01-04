/**
 * Parse a date string in local timezone, avoiding timezone issues.
 * Use this when you want to treat the date as local (e.g., "2024-01-15" should mean Jan 15th in the user's timezone).
 */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a date to YYYY-MM-DD string in local timezone
 */
export function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get today's date as YYYY-MM-DD string in local timezone
 */
export function getTodayString(): string {
  return formatDateString(new Date());
}

/**
 * Get today's date for SSR-safe initialization.
 * Returns empty string on server, actual date on client.
 * Use with useEffect to update on client mount.
 */
export function getClientTodayString(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return formatDateString(new Date());
}

/**
 * Get the start of current month as YYYY-MM-DD string in local timezone
 */
export function getStartOfMonthString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

/**
 * Get the start of current month for SSR-safe initialization.
 */
export function getClientStartOfMonthString(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  return getStartOfMonthString();
}
