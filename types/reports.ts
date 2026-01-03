import type { LeaveRequest } from './leave';

export interface EmployeeTaskStats {
  totalAssigned: number;
  completed: number;
  pending: number;
  overdue: number;
  completionRate: number;
  avgCompletionTime: number;
  byCategory: CategoryStat[];
  byPriority: PriorityStat[];
  trend: TrendData[];
}

export interface CategoryStat {
  categoryId: string;
  categoryName: string;
  color: string;
  total: number;
  completed: number;
}

export interface PriorityStat {
  priority: 'low' | 'medium' | 'high' | 'urgent';
  total: number;
  completed: number;
}

export interface TrendData {
  date: string;
  assigned: number;
  completed: number;
}

export interface EmployeeLeaveStats {
  currentYear: number;
  vacationTotal: number;
  vacationUsed: number;
  vacationRemaining: number;
  sickTotal: number;
  sickUsed: number;
  sickRemaining: number;
  totalDaysOff: number;
  leavesByMonth: MonthlyLeaveData[];
  upcomingLeave: LeaveRequest[];
  leaveHistory: LeaveRequest[];
}

export interface MonthlyLeaveData {
  month: string;
  vacation: number;
  sick: number;
}

export interface EmployeeReport {
  employee: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl: string | null;
    hireDate: string | null;
    groups: string[];
  };
  taskStats: EmployeeTaskStats;
  leaveStats: EmployeeLeaveStats;
  recentActivity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  type: 'task_completed' | 'task_assigned' | 'leave_requested' | 'leave_approved';
  title: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ReportFilters {
  employeeId?: string;
  dateFrom: string;
  dateTo: string;
  groupId?: string;
}

export interface TeamOverview {
  totalEmployees: number;
  activeToday: number;
  onLeaveToday: number;
  taskCompletionRate: number;
  topPerformers: {
    employeeId: string;
    fullName: string;
    completedTasks: number;
    completionRate: number;
  }[];
  leaveOverview: {
    pendingRequests: number;
    approvedThisMonth: number;
    totalDaysOffThisMonth: number;
  };
}
