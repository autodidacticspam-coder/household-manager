import { type GoogleCalendarEvent } from './calendar-service';

// Color IDs for Google Calendar (1-11)
// See: https://developers.google.com/calendar/api/v3/reference/colors
const COLORS = {
  task: '9',         // Blue-gray
  leave: '7',        // Cyan
  schedule: '3',     // Purple
  importantDate: '6', // Orange
  childLog: {
    sleep: '1',      // Lavender
    food: '5',       // Yellow
    poop: '10',      // Green
    shower: '10',    // Green
  },
};

interface TaskData {
  id: string;
  title: string;
  description?: string;
  dueDate: string;
  dueTime?: string;
  isAllDay?: boolean;
  isActivity?: boolean;
  startTime?: string;
  endTime?: string;
  status?: string;
  priority?: string;
}

interface LeaveData {
  id: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  leaveType: string;
  status: string;
}

interface ScheduleData {
  id: string;
  employeeName: string;
  date: string;
  startTime: string;
  endTime: string;
}

interface ImportantDateData {
  id: string;
  employeeName: string;
  label: string;
  date: string; // MM-DD format or full date
  year?: number;
}

interface ChildLogData {
  id: string;
  childName: string;
  category: 'sleep' | 'food' | 'poop' | 'shower';
  logDate: string;
  logTime: string;
  description?: string;
  endTime?: string; // For sleep logs
}

// Default timezone for events
const DEFAULT_TIMEZONE = 'America/Los_Angeles';

/**
 * Map a task to Google Calendar event format
 */
export function taskToCalendarEvent(task: TaskData): GoogleCalendarEvent {
  // Determine start/end based on task type
  let start: GoogleCalendarEvent['start'];
  let end: GoogleCalendarEvent['end'];

  // Activities carry their times in startTime/endTime and usually have no
  // dueTime, so this check must come before the all-day fallback — otherwise
  // a 7:45-8:45 lesson lands on the calendar as an all-day banner.
  if (task.isActivity && task.startTime && task.endTime) {
    // Activity with duration
    ({ start, end } = timedRange(task.dueDate, task.startTime, task.endTime));
  } else if (task.isAllDay || !task.dueTime) {
    start = { date: task.dueDate };
    end = { date: task.dueDate };
  } else {
    // Timed task without duration (1 hour default)
    ({ start, end } = timedRange(task.dueDate, task.dueTime, addHours(task.dueTime, 1)));
  }

  const event: GoogleCalendarEvent = {
    summary: task.status === 'completed' ? `✓ ${task.title}` : task.title,
    description: task.description || '',
    start,
    end,
    colorId: COLORS.task,
    extendedProperties: {
      private: {
        sourceType: 'task',
        sourceId: task.id,
      },
    },
  };

  return event;
}

/**
 * Map a leave request to Google Calendar event format
 */
export function leaveToCalendarEvent(leave: LeaveData): GoogleCalendarEvent {
  const typeLabel = leave.leaveType === 'vacation' ? 'PTO' :
                   leave.leaveType === 'sick' ? 'Sick' : leave.leaveType;

  return {
    summary: `${leave.employeeName} - ${typeLabel}`,
    description: `Leave request (${leave.status})`,
    colorId: COLORS.leave,
    start: { date: leave.startDate },
    end: { date: addDays(leave.endDate, 1) }, // Google Calendar end date is exclusive
    extendedProperties: {
      private: {
        sourceType: 'leave',
        sourceId: leave.id,
      },
    },
  };
}

/**
 * Map a work schedule to Google Calendar event format
 */
export function scheduleToCalendarEvent(schedule: ScheduleData): GoogleCalendarEvent {
  const { start, end } = timedRange(schedule.date, schedule.startTime, schedule.endTime);
  return {
    summary: `${schedule.employeeName} - Work`,
    description: 'Work schedule',
    colorId: COLORS.schedule,
    start,
    end,
    extendedProperties: {
      private: {
        sourceType: 'schedule',
        sourceId: schedule.id,
      },
    },
  };
}

/**
 * Map an important date to Google Calendar event format
 */
export function importantDateToCalendarEvent(data: ImportantDateData): GoogleCalendarEvent {
  // Important dates are stored as MM-DD, we need to create a full date
  let date: string;
  if (data.date.includes('-') && data.date.length === 5) {
    // MM-DD format, use current year
    const year = data.year || new Date().getFullYear();
    date = `${year}-${data.date}`;
  } else {
    date = data.date;
  }

  return {
    summary: `${data.employeeName} - ${data.label}`,
    description: `Annual reminder: ${data.label}`,
    colorId: COLORS.importantDate,
    start: { date },
    end: { date },
    extendedProperties: {
      private: {
        sourceType: 'important_date',
        sourceId: data.id,
      },
    },
  };
}

/**
 * Map a child log to Google Calendar event format
 */
export function childLogToCalendarEvent(log: ChildLogData): GoogleCalendarEvent {
  const categoryLabels: Record<string, string> = {
    sleep: 'Sleep',
    food: 'Food',
    poop: 'Diaper',
    shower: 'Bath',
  };

  // Determine start/end times
  let start: GoogleCalendarEvent['start'];
  let end: GoogleCalendarEvent['end'];

  if (log.category === 'sleep' && log.endTime) {
    // Overnight sleep (e.g. 21:00 -> 06:30) rolls the end to the next day
    ({ start, end } = timedRange(log.logDate, log.logTime, log.endTime));
  } else {
    // Other logs are point-in-time (30 min default)
    ({ start, end } = timedRange(log.logDate, log.logTime, addMinutes(log.logTime, 30)));
  }

  return {
    summary: `${log.childName} - ${categoryLabels[log.category] || log.category}`,
    description: log.description || '',
    start,
    end,
    colorId: COLORS.childLog[log.category] || COLORS.childLog.sleep,
    extendedProperties: {
      private: {
        sourceType: 'child_log',
        sourceId: log.id,
      },
    },
  };
}

// Helper functions

// Google requires full RFC3339 datetimes (seconds included). UI callers send
// HH:mm while DB TIME columns carry HH:mm:ss — normalize so both paths embed
// identical strings (otherwise Google rejects the instant-sync payloads and
// the reconciler's content hashes never match the instant path's).
function normalizeTime(time: string): string {
  const [h = '0', m = '0', s = '0'] = time.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${(s || '0').padStart(2, '0')}`;
}

// Build a timed start/end pair; when the end time is not after the start
// time the range crosses midnight, so the end lands on the following day.
function timedRange(
  date: string,
  startTime: string,
  endTime: string
): { start: GoogleCalendarEvent['start']; end: GoogleCalendarEvent['end'] } {
  const start = normalizeTime(startTime);
  const end = normalizeTime(endTime);
  const endDate = end > start ? date : addDays(date, 1);
  return {
    start: { dateTime: `${date}T${start}`, timeZone: DEFAULT_TIMEZONE },
    end: { dateTime: `${endDate}T${end}`, timeZone: DEFAULT_TIMEZONE },
  };
}

function addHours(time: string, hours: number): string {
  const [h, m, s] = time.split(':').map(Number);
  const newHour = (h + hours) % 24;
  return `${String(newHour).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}:${String(s || 0).padStart(2, '0')}`;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m, s] = time.split(':').map(Number);
  const totalMinutes = (h * 60) + (m || 0) + minutes;
  const newHour = Math.floor(totalMinutes / 60) % 24;
  const newMinute = totalMinutes % 60;
  return `${String(newHour).padStart(2, '0')}:${String(newMinute).padStart(2, '0')}:${String(s || 0).padStart(2, '0')}`;
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}
