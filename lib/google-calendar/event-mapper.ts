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

/**
 * Map a task to Google Calendar event format
 */
export function taskToCalendarEvent(task: TaskData): GoogleCalendarEvent {
  // Determine start/end based on task type
  let start: GoogleCalendarEvent['start'];
  let end: GoogleCalendarEvent['end'];

  if (task.isAllDay || !task.dueTime) {
    start = { date: task.dueDate };
    end = { date: task.dueDate };
  } else if (task.isActivity && task.startTime && task.endTime) {
    // Activity with duration
    start = { dateTime: `${task.dueDate}T${task.startTime}` };
    end = { dateTime: `${task.dueDate}T${task.endTime}` };
  } else {
    // Timed task without duration (1 hour default)
    const startDateTime = `${task.dueDate}T${task.dueTime}`;
    start = { dateTime: startDateTime };
    const endTime = addHours(task.dueTime, 1);
    end = { dateTime: `${task.dueDate}T${endTime}` };
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
  return {
    summary: `${schedule.employeeName} - Work`,
    description: 'Work schedule',
    colorId: COLORS.schedule,
    start: { dateTime: `${schedule.date}T${schedule.startTime}` },
    end: { dateTime: `${schedule.date}T${schedule.endTime}` },
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
    start = { dateTime: `${log.logDate}T${log.logTime}` };
    end = { dateTime: `${log.logDate}T${log.endTime}` };
  } else {
    // Other logs are point-in-time (30 min default)
    start = { dateTime: `${log.logDate}T${log.logTime}` };
    end = { dateTime: `${log.logDate}T${addMinutes(log.logTime, 30)}` };
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
