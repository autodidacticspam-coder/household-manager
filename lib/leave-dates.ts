/** Existing accounting convention; this does not set an employee's entitlement. */
export const LEAVE_MINUTES_PER_DAY = 8 * 60;
const DAY_MS = 86_400_000;

export function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function timeMinutes(value?: string | null): number | null {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export type LeaveDates = {
  startDate: string; endDate: string; selectedDates?: string[] | null;
  isFullDay?: boolean; startTime?: string | null; endTime?: string | null;
};

/** Date-only UTC arithmetic avoids the 23/25-hour DST day problem. */
export function leaveDates(leave: LeaveDates, rangeStart = leave.startDate, rangeEnd = leave.endDate): string[] {
  if (!isDateOnly(leave.startDate) || !isDateOnly(leave.endDate) || leave.endDate < leave.startDate) return [];
  const start = [leave.startDate, rangeStart].sort().at(-1)!;
  const end = [leave.endDate, rangeEnd].sort()[0];
  if (start > end) return [];
  if (leave.selectedDates?.length) {
    return [...new Set(leave.selectedDates)].filter(date => isDateOnly(date) && date >= start && date <= end).sort();
  }
  const days: string[] = [];
  for (let stamp = Date.parse(`${start}T00:00:00Z`); stamp <= Date.parse(`${end}T00:00:00Z`); stamp += DAY_MS) {
    days.push(new Date(stamp).toISOString().slice(0, 10));
  }
  return days;
}

export function leaveTotalDays(leave: LeaveDates): number {
  const dates = leaveDates(leave);
  if (!dates.length) throw new Error('leaveErrors.invalidDates');
  if (leave.isFullDay !== false) return dates.length;
  const start = timeMinutes(leave.startTime), end = timeMinutes(leave.endTime);
  if (dates.length !== 1 || leave.startDate !== leave.endDate) throw new Error('leaveErrors.partialSingleDay');
  if (start === null || end === null) throw new Error('leaveErrors.timesRequired');
  if (end <= start) throw new Error('leaveErrors.timeOrder');
  return Math.round(((end - start) / LEAVE_MINUTES_PER_DAY) * 10_000) / 10_000;
}

export function leaveDateRanges(leave: LeaveDates, rangeStart?: string, rangeEnd?: string): { start: string; end: string }[] {
  const ranges: { start: string; end: string }[] = [];
  for (const date of leaveDates(leave, rangeStart, rangeEnd)) {
    const previous = ranges.at(-1);
    if (previous && Date.parse(`${date}T00:00:00Z`) - Date.parse(`${previous.end}T00:00:00Z`) === DAY_MS) previous.end = date;
    else ranges.push({ start: date, end: date });
  }
  return ranges;
}

export function isOnLeaveAt(leave: LeaveDates, date: string, time: string): boolean {
  if (!leaveDates(leave, date, date).length) return false;
  if (leave.isFullDay !== false) return true;
  const current = timeMinutes(time), start = timeMinutes(leave.startTime), end = timeMinutes(leave.endTime);
  return current !== null && start !== null && end !== null && current >= start && current < end;
}

export function storedLeaveDates(row: {
  start_date: string; end_date: string; selected_dates?: string[] | null;
  is_full_day?: boolean; start_time?: string | null; end_time?: string | null;
}): LeaveDates {
  return { startDate: row.start_date, endDate: row.end_date, selectedDates: row.selected_dates,
    isFullDay: row.is_full_day, startTime: row.start_time, endTime: row.end_time };
}
