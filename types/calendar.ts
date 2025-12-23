export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  allDay: boolean;
  type: 'task' | 'task_instance' | 'leave';
  color: string;
  sourceId: string;
  sourceType: 'task' | 'task_instance' | 'leave_request';
  priority?: string;
  status?: string;
  category?: string;
  leaveType?: string;
  employeeName?: string;
}

export interface GoogleCalendarToken {
  id: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: string;
  calendarId: string;
}

export interface CalendarSyncResult {
  success: boolean;
  eventId?: string;
  error?: string;
}

export interface CalendarViewState {
  view: 'month' | 'week' | 'day';
  date: Date;
  filters: {
    showTasks: boolean;
    showLeave: boolean;
    categories: string[];
  };
}
