export interface EmployeeSchedule {
  id: string;
  userId: string;
  dayOfWeek: number; // 0=Sunday, 6=Saturday
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeScheduleWithUser extends EmployeeSchedule {
  user?: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
  };
}

export interface ScheduleFormData {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const DAYS_OF_WEEK_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export interface ScheduleOverride {
  id: string;
  scheduleId: string;
  overrideDate: string; // YYYY-MM-DD
  startTime: string | null;
  endTime: string | null;
  isCancelled: boolean;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleOverrideFormData {
  scheduleId: string;
  overrideDate: string;
  startTime?: string;
  endTime?: string;
  isCancelled?: boolean;
  notes?: string;
}
