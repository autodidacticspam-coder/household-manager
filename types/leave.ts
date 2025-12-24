export type LeaveType = 'pto' | 'sick';
export type LeaveStatus = 'pending' | 'approved' | 'denied';

export interface LeaveRequest {
  id: string;
  userId: string;
  leaveType: LeaveType;
  status: LeaveStatus;
  startDate: string;
  endDate: string;
  selectedDates: string[] | null;
  isFullDay: boolean;
  startTime: string | null;
  endTime: string | null;
  totalDays: number;
  reason: string | null;
  adminNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl: string | null;
  };
  reviewer?: {
    id: string;
    fullName: string;
  };
}

export interface LeaveBalance {
  id: string;
  userId: string;
  year: number;
  ptoTotal: number;
  ptoUsed: number;
  sickTotal: number;
  sickUsed: number;
  ptoRemaining?: number;
  sickRemaining?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeaveStats {
  pendingRequests: number;
  approvedThisMonth: number;
  totalEmployeesOut: number;
  upcomingLeaves: LeaveRequest[];
}

export interface EmployeeLeaveOverview {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  currentStatus: 'working' | 'on_leave' | 'off_today';
  balance: LeaveBalance;
  pendingRequests: number;
  nextLeave: LeaveRequest | null;
}
