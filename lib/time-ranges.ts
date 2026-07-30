import type { AvailabilityRange } from '@/types';

// Times are "HH:mm" strings, which compare correctly as strings.

// Merge overlapping/touching ranges into a sorted, non-overlapping list
export function mergeRanges(ranges: AvailabilityRange[]): AvailabilityRange[] {
  const sorted = [...ranges].sort((a, b) => a.startTime.localeCompare(b.startTime));
  const merged: AvailabilityRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.startTime <= last.endTime) {
      if (range.endTime > last.endTime) last.endTime = range.endTime;
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

// The parts of `available` not covered by any range in `taken`
export function subtractRanges(
  available: AvailabilityRange[],
  taken: AvailabilityRange[]
): AvailabilityRange[] {
  const blocks = mergeRanges(taken);
  const free: AvailabilityRange[] = [];
  for (const range of available) {
    let cursor = range.startTime;
    for (const block of blocks) {
      if (block.endTime <= cursor || block.startTime >= range.endTime) continue;
      if (block.startTime > cursor) {
        free.push({ startTime: cursor, endTime: block.startTime });
      }
      if (block.endTime > cursor) cursor = block.endTime;
      if (cursor >= range.endTime) break;
    }
    if (cursor < range.endTime) {
      free.push({ startTime: cursor, endTime: range.endTime });
    }
  }
  return free;
}

export function rangeMinutes(range: AvailabilityRange): number {
  const [sh, sm] = range.startTime.split(':').map(Number);
  const [eh, em] = range.endTime.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}
