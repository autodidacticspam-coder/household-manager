export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'pending' | 'in_progress' | 'completed';
export type AssignmentTargetType = 'user' | 'group' | 'all' | 'all_admins';

export interface TaskCategory {
  id: string;
  name: string;
  color: string;
  icon: string | null;
}

export interface TaskAssignment {
  id: string;
  taskId: string;
  targetType: AssignmentTargetType;
  targetUserId: string | null;
  targetGroupId: string | null;
  createdAt?: string;
  targetUser?: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
  } | null;
  targetGroup?: {
    id: string;
    name: string;
  } | null;
}

export interface Task {
  id: string;
  title: string;
  titleEs: string | null;
  titleZh: string | null;
  description: string | null;
  descriptionEs: string | null;
  descriptionZh: string | null;
  sourceLocale: string | null;
  categoryId: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  dueTime: string | null;
  isAllDay: boolean;
  isActivity: boolean;
  startTime: string | null;
  endTime: string | null;
  isRecurring: boolean;
  recurrenceRule: string | null;
  syncToCalendar: boolean;
  googleCalendarEventId: string | null;
  createdBy: string | null;
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category?: TaskCategory;
  assignments?: TaskAssignment[];
  createdByUser?: {
    id: string;
    fullName: string;
  };
}

export interface TaskInstance {
  id: string;
  parentTaskId: string;
  instanceDate: string;
  status: TaskStatus;
  completedBy: string | null;
  completedAt: string | null;
  titleOverride: string | null;
  descriptionOverride: string | null;
  parentTask?: Task;
}

export interface TaskFilters {
  status?: TaskStatus | 'all';
  priority?: TaskPriority | 'all';
  categoryId?: string | 'all';
  assignedTo?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

// Task with all relations populated
export type TaskWithRelations = Omit<Task, 'category' | 'createdByUser' | 'assignments'> & {
  category: TaskCategory | null;
  createdByUser: { id: string; fullName: string; avatarUrl: string | null } | null;
  completedByUser: { id: string; fullName: string; avatarUrl: string | null } | null;
  assignments: Array<TaskAssignment & {
    targetUser: { id: string; fullName: string; avatarUrl: string | null } | null;
    targetGroup: { id: string; name: string } | null;
  }>;
};

export interface RecurrencePattern {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  byWeekday?: number[];
  byMonthDay?: number[];
  until?: string;
  count?: number;
}

export interface TemplateAssignment {
  targetType: AssignmentTargetType;
  targetUserId: string | null;
  targetGroupId: string | null;
}

export interface TaskTemplate {
  id: string;
  name: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  priority: TaskPriority;
  isAllDay: boolean;
  defaultTime: string | null;
  isActivity: boolean;
  startTime: string | null;
  endTime: string | null;
  isRecurring: boolean;
  recurrenceRule: string | null;
  defaultAssignments: TemplateAssignment[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  category?: TaskCategory | null;
}
