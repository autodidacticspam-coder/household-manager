import { describe, expect, it } from 'vitest';
import { leaveToCalendarEvent } from './event-mapper';
import { leaveDateRanges } from '@/lib/leave-dates';

describe('leave calendar representation', () => {
  it('preserves gaps and clips events to the visible range', () => {
    expect(leaveDateRanges({ startDate: '2026-09-07', endDate: '2026-09-11', selectedDates: ['2026-09-07', '2026-09-08', '2026-09-11'] }, '2026-09-08', '2026-09-11'))
      .toEqual([{ start: '2026-09-08', end: '2026-09-08' }, { start: '2026-09-11', end: '2026-09-11' }]);
  });
  it('exports a partial day as its actual time interval', () => {
    const event = leaveToCalendarEvent({ id: 'leave', employeeName: 'Employee', startDate: '2026-09-07', endDate: '2026-09-07', leaveType: 'sick', status: 'approved', isFullDay: false, startTime: '09:00', endTime: '13:00' });
    expect(event.start).toEqual({ dateTime: '2026-09-07T09:00:00', timeZone: 'America/Los_Angeles' });
    expect(event.end).toEqual({ dateTime: '2026-09-07T13:00:00', timeZone: 'America/Los_Angeles' });
  });
});
