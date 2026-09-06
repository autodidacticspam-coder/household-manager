import { describe, expect, it } from 'vitest';
import { futureSeriesDates, taskSeriesKey } from './task-series';

describe('task series identity and dates', () => {
  it('keeps independent tasks separate even when their names and timestamps match', () => {
    expect(taskSeriesKey({ id: 'a' })).not.toBe(taskSeriesKey({ id: 'b' }));
    expect(taskSeriesKey({ id: 'a', series_id: 'one' })).toBe(taskSeriesKey({ id: 'b', series_id: 'one' }));
    expect(taskSeriesKey({ id: 'a', series_id: 'one' })).not.toBe(taskSeriesKey({ id: 'b', series_id: 'two' }));
  });
  it('keeps the original biweekly phase when extending from a Thursday', () => {
    expect(futureSeriesDates({ repeatDays: [1, 4], repeatInterval: 'biweekly', startDate: '2026-09-07', afterDate: '2026-09-10', endDate: '2026-09-28' })).toEqual(['2026-09-21', '2026-09-24']);
  });
  it('rejects an unbounded series extension', () => {
    expect(() => futureSeriesDates({ repeatDays: [1], repeatInterval: 'weekly', startDate: '2026-09-07', afterDate: '2026-09-07', endDate: '2099-01-01' })).toThrow('2 years');
  });
});
