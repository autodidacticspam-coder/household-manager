import { describe, expect, it } from 'vitest';
import { mergeRanges, rangeMinutes, subtractRanges } from '@/lib/time-ranges';

describe('time range helpers', () => {
  it('merges overlapping and touching ranges in chronological order', () => {
    expect(mergeRanges([
      { startTime: '13:00', endTime: '15:00' },
      { startTime: '09:00', endTime: '11:00' },
      { startTime: '11:00', endTime: '14:00' },
    ])).toEqual([{ startTime: '09:00', endTime: '15:00' }]);
  });

  it('removes a block from the middle of an available range', () => {
    expect(subtractRanges(
      [{ startTime: '09:00', endTime: '17:00' }],
      [{ startTime: '12:00', endTime: '14:00' }]
    )).toEqual([
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '14:00', endTime: '17:00' },
    ]);
  });

  it('removes an availability range covered by a block', () => {
    expect(subtractRanges(
      [{ startTime: '10:00', endTime: '14:00' }],
      [{ startTime: '09:00', endTime: '15:00' }]
    )).toEqual([]);
  });

  it('leaves availability unchanged when blocks do not overlap', () => {
    expect(subtractRanges(
      [{ startTime: '10:00', endTime: '14:00' }],
      [{ startTime: '14:00', endTime: '16:00' }]
    )).toEqual([{ startTime: '10:00', endTime: '14:00' }]);
  });

  it('calculates the duration of a range in minutes', () => {
    expect(rangeMinutes({ startTime: '10:15', endTime: '14:45' })).toBe(270);
  });
});
