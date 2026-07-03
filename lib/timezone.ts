/**
 * The household's wall-clock timezone. Task times, schedules, and child logs
 * are all entered and displayed in this zone (it matches the timezone the
 * Google Calendar sync stamps events with). Server code runs in UTC on
 * Vercel, so anything that compares a stored HH:MM / YYYY-MM-DD against "now"
 * must convert through here rather than using the server clock directly.
 */
export const HOUSEHOLD_TIMEZONE = 'America/Los_Angeles';

interface ZonedParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS (24h)
  hour: number;
  minute: number;
}

/**
 * Break a Date down into date/time parts as they read on the clock in the
 * household timezone. DST-correct because it goes through Intl.
 */
export function getZonedParts(date: Date, timeZone: string = HOUSEHOLD_TIMEZONE): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  // en-CA with hour12:false renders midnight as "24" in some runtimes.
  let hour = map.hour;
  if (hour === '24') hour = '00';

  return {
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${hour}:${map.minute}:${map.second}`,
    hour: Number(hour),
    minute: Number(map.minute),
  };
}

/** Today's date (YYYY-MM-DD) in the household timezone. */
export function getZonedDateString(date: Date, timeZone: string = HOUSEHOLD_TIMEZONE): string {
  return getZonedParts(date, timeZone).date;
}
