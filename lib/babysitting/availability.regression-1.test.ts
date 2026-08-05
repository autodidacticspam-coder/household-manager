import { describe, expect, it } from 'vitest';
import {
  excludeDeclinedAvailabilityFromEntries,
  getAvailabilityWeekStart,
  getEffectiveAvailabilityRanges,
  isAvailabilityWindowCovered,
} from '@/lib/babysitting/availability';
import type { DeclinedAvailabilityBlock } from '@/types';

// Regression: ISSUE-001 — a later week save restored a declined babysitting slot
// Found by /qa on 2026-08-05
// Report: .gstack/qa-reports/qa-report-household-manager-two-vercel-app-2026-08-05.md
describe('declined babysitting availability', () => {
  const joyceDecline: DeclinedAvailabilityBlock = {
    id: 'declined-request',
    userId: 'joyce',
    entryDate: '2026-08-13',
    startTime: '10:00',
    endTime: '14:00',
  };

  it('shows Joyce as unavailable even when the declined range was restored in storage', () => {
    expect(getEffectiveAvailabilityRanges(
      [{ startTime: '10:00', endTime: '14:00' }],
      [joyceDecline]
    )).toEqual([]);
  });

  it('does not persist a declined slot during a later weekly save', () => {
    expect(excludeDeclinedAvailabilityFromEntries([
      { entryDate: '2026-08-11', startTime: '10:00', endTime: '14:00' },
      { entryDate: '2026-08-13', startTime: '10:00', endTime: '14:00' },
    ], [joyceDecline])).toEqual([
      { entryDate: '2026-08-11', startTime: '10:00', endTime: '14:00' },
    ]);
  });

  it('keeps unaffected time available around a partial decline', () => {
    expect(getEffectiveAvailabilityRanges(
      [{ startTime: '09:00', endTime: '17:00' }],
      [{ startTime: '12:00', endTime: '14:00' }]
    )).toEqual([
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '14:00', endTime: '17:00' },
    ]);
  });

  it('does not cover a new request that overlaps the declined window', () => {
    const effective = getEffectiveAvailabilityRanges(
      [{ startTime: '09:00', endTime: '17:00' }],
      [{ startTime: '12:00', endTime: '14:00' }]
    );

    expect(isAvailabilityWindowCovered(effective, '12:30', '13:30')).toBe(false);
    expect(isAvailabilityWindowCovered(effective, '09:30', '11:30')).toBe(true);
  });

  it('uses the same Sunday week boundary as stored availability', () => {
    expect(getAvailabilityWeekStart('2026-08-13')).toBe('2026-08-09');
  });
});
