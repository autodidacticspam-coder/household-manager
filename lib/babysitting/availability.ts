import type { SupabaseClient } from '@supabase/supabase-js';
import { parseLocalDate, formatDateString } from '@/lib/date-utils';
import { subtractRanges } from '@/lib/time-ranges';

// Sunday-start week, matching babysitter_availability_weeks.week_start
function weekStartOf(date: string): string {
  const d = parseLocalDate(date);
  d.setDate(d.getDate() - d.getDay());
  return formatDateString(d);
}

function weekDatesOf(weekStart: string): string[] {
  const start = parseLocalDate(weekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return formatDateString(d);
  });
}

/**
 * A declined booking request means the sitter is NOT free at that time,
 * whatever their saved availability says. Remove the declined window from
 * their availability for that week, materializing the week from their
 * usual template first if they hadn't customized it. The template itself
 * is never touched, and the sitter can still "Reset to usual".
 */
export async function removeDeclinedAvailabilityWindow(
  supabase: SupabaseClient,
  args: { userId: string; date: string; startTime: string; endTime: string }
): Promise<void> {
  const { userId, date } = args;
  const startTime = args.startTime.slice(0, 5);
  const endTime = args.endTime.slice(0, 5);
  const weekStart = weekStartOf(date);

  const { data: weekRow, error: weekError } = await supabase
    .from('babysitter_availability_weeks')
    .select('id')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (weekError) throw weekError;

  if (!weekRow) {
    const { data: template, error: templateError } = await supabase
      .from('babysitter_availability_templates')
      .select('day_of_week, start_time, end_time')
      .eq('user_id', userId);
    if (templateError) throw templateError;

    const { error: insertWeekError } = await supabase
      .from('babysitter_availability_weeks')
      .upsert(
        { user_id: userId, week_start: weekStart, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,week_start' }
      );
    if (insertWeekError) throw insertWeekError;

    const weekDates = weekDatesOf(weekStart);
    const entries = (template || []).map((slot) => ({
      user_id: userId,
      entry_date: weekDates[slot.day_of_week],
      start_time: slot.start_time.slice(0, 5),
      end_time: slot.end_time.slice(0, 5),
    }));
    if (entries.length > 0) {
      const { error: insertError } = await supabase
        .from('babysitter_availability_entries')
        .insert(entries);
      if (insertError) throw insertError;
    }
  }

  // Replace that date's entries with whatever falls outside the declined window
  const { data: dayEntries, error: entriesError } = await supabase
    .from('babysitter_availability_entries')
    .select('id, start_time, end_time')
    .eq('user_id', userId)
    .eq('entry_date', date);
  if (entriesError) throw entriesError;

  const ranges = (dayEntries || []).map((e) => ({
    startTime: (e.start_time as string).slice(0, 5),
    endTime: (e.end_time as string).slice(0, 5),
  }));
  const remaining = subtractRanges(ranges, [{ startTime, endTime }]);

  const unchanged =
    remaining.length === ranges.length &&
    remaining.every((r, i) => r.startTime === ranges[i].startTime && r.endTime === ranges[i].endTime);
  if (unchanged) return;

  const { error: deleteError } = await supabase
    .from('babysitter_availability_entries')
    .delete()
    .eq('user_id', userId)
    .eq('entry_date', date);
  if (deleteError) throw deleteError;

  if (remaining.length > 0) {
    const { error: reinsertError } = await supabase
      .from('babysitter_availability_entries')
      .insert(remaining.map((r) => ({
        user_id: userId,
        entry_date: date,
        start_time: r.startTime,
        end_time: r.endTime,
      })));
    if (reinsertError) throw reinsertError;
  }
}
