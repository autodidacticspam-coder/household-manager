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

export interface TaskViewer {
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

export type TaskVideoType = 'upload' | 'link';

export interface TaskVideo {
  id: string;
  taskId: string;
  videoType: TaskVideoType;
  url: string;
  title: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface TemplateVideo {
  id: string;
  templateId: string;
  videoType: TaskVideoType;
  url: string;
  title: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  createdAt: string;
  createdBy: string | null;
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
  viewers?: Array<TaskViewer & {
    targetUser: { id: string; fullName: string; avatarUrl: string | null } | null;
    targetGroup: { id: string; name: string } | null;
  }>;
  videos?: TaskVideo[];
};

export type RepeatInterval = 'weekly' | 'biweekly' | 'monthly';

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
  repeatDays: number[] | null; // 0=Sun, 1=Mon, ..., 6=Sat
  repeatInterval: RepeatInterval | null;
  defaultAssignments: TemplateAssignment[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  category?: TaskCategory | null;
  videos?: TemplateVideo[];
}
