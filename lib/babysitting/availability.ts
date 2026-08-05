import { formatDateString, parseLocalDate } from '@/lib/date-utils';
import { mergeRanges, subtractRanges } from '@/lib/time-ranges';
import type {
  AvailabilityRange,
  DeclinedAvailabilityBlock,
  DatedAvailabilityRange,
} from '@/types';

/** Sunday-start week, matching babysitter_availability_weeks.week_start. */
export function getAvailabilityWeekStart(date: string): string {
  const parsed = parseLocalDate(date);
  parsed.setDate(parsed.getDate() - parsed.getDay());
  return formatDateString(parsed);
}

/**
 * Declined booking requests are durable unavailable windows. They are applied
 * after the sitter's usual or week-specific availability so a later save or
 * "Reset to usual" cannot silently advertise a rejected time again.
 */
export function getEffectiveAvailabilityRanges(
  availableRanges: AvailabilityRange[],
  declinedRanges: AvailabilityRange[]
): AvailabilityRange[] {
  return subtractRanges(mergeRanges(availableRanges), declinedRanges);
}

export function isAvailabilityWindowCovered(
  availableRanges: AvailabilityRange[],
  startTime: string,
  endTime: string
): boolean {
  return mergeRanges(availableRanges).some(
    (range) => range.startTime <= startTime && range.endTime >= endTime
  );
}

/** Remove declined windows before persisting a sitter's week adjustment. */
export function excludeDeclinedAvailabilityFromEntries(
  entries: DatedAvailabilityRange[],
  declinedBlocks: DeclinedAvailabilityBlock[]
): DatedAvailabilityRange[] {
  const dates = [...new Set(entries.map((entry) => entry.entryDate))];

  return dates.flatMap((entryDate) => {
    const ranges = entries
      .filter((entry) => entry.entryDate === entryDate)
      .map(({ startTime, endTime }) => ({ startTime, endTime }));
    const blocked = declinedBlocks
      .filter((block) => block.entryDate === entryDate)
      .map(({ startTime, endTime }) => ({ startTime, endTime }));

    return getEffectiveAvailabilityRanges(ranges, blocked).map((range) => ({
      entryDate,
      ...range,
    }));
  });
}
