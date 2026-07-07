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
 * Handles edge cases like missing minutes (e.g., "9 AM" → "09:00")
 * Returns null if input is invalid
 */
export function formatTime24h(time12h: string): string | null {
  if (!time12h || !time12h.trim()) return null;

  // Try standard format first: "h:mm AM/PM"
  let match = time12h.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  // Try format without minutes: "h AM/PM" (treat as h:00)
  if (!match) {
    match = time12h.match(/^(\d{1,2})\s*(AM|PM)$/i);
    if (match) {
      // Insert '00' for minutes
      match = [match[0], match[1], '00', match[2]];
    }
  }

  // Try format with partial minutes: "h:m AM/PM" (single digit minute)
  if (!match) {
    const partialMatch = time12h.match(/^(\d{1,2}):(\d)\s*(AM|PM)$/i);
    if (partialMatch) {
      match = [partialMatch[0], partialMatch[1], '0' + partialMatch[2], partialMatch[3]];
    }
  }

  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = match[3].toUpperCase();

  // Validate hours and minutes ("9:75 PM" would otherwise become the
  // invalid TIME value 21:75 and bounce off the database as a 500)
  if (hours < 1 || hours > 12) return null;
  if (parseInt(minutes, 10) > 59) return null;

  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }

  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

/**
 * Format a time input field as the user types, handling entries like
 * "0200" -> "2:00", "930" -> "9:30", and backspacing through the colon.
 */
export function formatTimeInput(value: string, previousValue: string): string {
  // Remove non-digit and non-colon characters
  const cleaned = value.replace(/[^\d:]/g, '');

  // If user is backspacing, allow normal backspace behavior
  if (cleaned.length < previousValue.length) {
    if (previousValue.includes(':') && !cleaned.includes(':')) {
      // User deleted through the colon, just return digits
      return cleaned.replace(':', '');
    }
    return cleaned;
  }

  // Remove any existing colons for processing
  const digitsOnly = cleaned.replace(/:/g, '');

  // Limit to 4 digits total (HHMM)
  const limited = digitsOnly.slice(0, 4);

  if (limited.length === 0) {
    return '';
  }

  if (limited.length <= 2) {
    // Just hours or partial hours
    return limited;
  }

  // 3 digits: H:MM (e.g., 930 -> 9:30)
  if (limited.length === 3) {
    return `${limited[0]}:${limited.slice(1)}`;
  }

  // 4 digits: HH:MM (e.g., 0930 -> 09:30, but 0200 -> 2:00)
  const hours = limited.slice(0, 2);
  const minutes = limited.slice(2);

  // Remove leading zero for hours display (02 -> 2)
  const displayHours = hours.replace(/^0/, '') || '0';

  return `${displayHours}:${minutes}`;
}
