import { describe, expect, it } from 'vitest';
import { isDateOnly, isOnLeaveAt, leaveDates, leaveTotalDays } from './leave-dates';
import { createLeaveRequestSchema } from './validators/leave';

describe('leave dates and accounting', () => {
  const scattered = { startDate: '2026-09-07', endDate: '2026-09-11', selectedDates: ['2026-09-11', '2026-09-07', '2026-09-07'] };
  it('counts unique selected days and clips overlap to the requested range', () => {
    expect(leaveTotalDays(scattered)).toBe(2);
    expect(leaveDates(scattered, '2026-09-08', '2026-09-11')).toEqual(['2026-09-11']);
    expect(isOnLeaveAt(scattered, '2026-09-09', '12:00')).toBe(false);
  });
  it('handles leap dates and DST without accepting rolled-over dates', () => {
    expect(isDateOnly('2026-02-29')).toBe(false);
    expect(isDateOnly('2028-02-29')).toBe(true);
    expect(leaveTotalDays({ startDate: '2026-03-07', endDate: '2026-03-09' })).toBe(3);
  });
  it('rejects reversed and multi-day partial requests', () => {
    expect(() => leaveTotalDays({ startDate: '2026-09-07', endDate: '2026-09-07', isFullDay: false, startTime: '17:00', endTime: '09:00' })).toThrow('timeOrder');
    expect(createLeaveRequestSchema.safeParse({ leaveType: 'sick', ...scattered, isFullDay: false, startTime: '09:00', endTime: '13:00' }).success).toBe(false);
    expect(createLeaveRequestSchema.safeParse({ leaveType: 'sick', ...scattered, selectedDates: ['2026-09-06'] }).success).toBe(false);
  });
  it('checks partial-day boundaries and never trusts a submitted count', () => {
    const partial = { startDate: '2026-09-07', endDate: '2026-09-07', isFullDay: false, startTime: '09:00', endTime: '13:00' };
    expect(leaveTotalDays(partial)).toBe(0.5);
    expect(isOnLeaveAt(partial, '2026-09-07', '08:59')).toBe(false);
    expect(isOnLeaveAt(partial, '2026-09-07', '09:00')).toBe(true);
    expect(isOnLeaveAt(partial, '2026-09-07', '13:00')).toBe(false);
    const parsed = createLeaveRequestSchema.parse({ leaveType: 'vacation', ...scattered, selectedDaysCount: 100 });
    expect(leaveTotalDays(parsed)).toBe(2);
  });
});
