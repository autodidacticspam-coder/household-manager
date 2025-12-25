/**
 * Converts 24-hour time string (HH:mm or HH:mm:ss) to 12-hour format with AM/PM
 */
export function formatTime12h(time: string | null | undefined): string {
  if (!time) return '';

  const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Converts 12-hour time (h:mm AM/PM) to 24-hour format (HH:mm)
 */
export function formatTime24h(time12h: string): string {
  const match = time12h.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return time12h;

  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3].toUpperCase();

  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }

  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}
