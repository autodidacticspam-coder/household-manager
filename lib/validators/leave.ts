import { z } from 'zod';

export const leaveTypeSchema = z.enum(['pto', 'sick']);
export const leaveStatusSchema = z.enum(['pending', 'approved', 'denied']);

export const createLeaveRequestSchema = z.object({
  leaveType: leaveTypeSchema,
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  isFullDay: z.boolean().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  reason: z.string().max(1000).nullable().optional(),
  selectedDaysCount: z.number().int().positive().optional(), // For calendar multi-select
}).refine((data) => {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  return start <= end;
}, {
  message: 'End date must be after or equal to start date',
  path: ['endDate'],
}).refine((data) => {
  if (!data.isFullDay) {
    return !!data.startTime && !!data.endTime;
  }
  return true;
}, {
  message: 'Start and end times are required for partial day requests',
  path: ['startTime'],
});

export const approveLeaveRequestSchema = z.object({
  requestId: z.string().uuid(),
  adminNotes: z.string().max(1000).nullable().optional(),
});

export const denyLeaveRequestSchema = z.object({
  requestId: z.string().uuid(),
  adminNotes: z.string().max(1000).nullable().optional(),
});

export const updateLeaveBalanceSchema = z.object({
  userId: z.string().uuid(),
  year: z.number().int().min(2000).max(2100),
  ptoTotal: z.number().min(0).max(365).optional(),
  sickTotal: z.number().min(0).max(365).optional(),
});

export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
export type ApproveLeaveRequestInput = z.infer<typeof approveLeaveRequestSchema>;
export type DenyLeaveRequestInput = z.infer<typeof denyLeaveRequestSchema>;
export type UpdateLeaveBalanceInput = z.infer<typeof updateLeaveBalanceSchema>;

// Helper function to calculate total days
export function calculateTotalDays(
  startDate: string,
  endDate: string,
  isFullDay: boolean,
  startTime?: string | null,
  endTime?: string | null
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isFullDay) {
    // Count inclusive days
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  }

  // Partial day - calculate based on hours (assuming 8-hour workday)
  if (startTime && endTime) {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const diffMinutes = endMinutes - startMinutes;

    if (diffMinutes > 0) {
      const hours = diffMinutes / 60;
      // Convert hours to days (8-hour workday)
      return Math.round((hours / 8) * 100) / 100;
    }
  }

  // Default partial day to 0.5 if no times specified
  return 0.5;
}
