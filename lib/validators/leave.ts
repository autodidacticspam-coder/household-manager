import { z } from 'zod';
import { isDateOnly, leaveTotalDays, timeMinutes } from '@/lib/leave-dates';

export const leaveTypeSchema = z.enum(['vacation', 'pto', 'sick']);
export const leaveStatusSchema = z.enum(['pending', 'approved', 'denied']);

export const createLeaveRequestSchema = z.object({
  leaveType: leaveTypeSchema,
  startDate: z.string().refine(isDateOnly, 'leaveErrors.invalidDates'),
  endDate: z.string().refine(isDateOnly, 'leaveErrors.invalidDates'),
  selectedDates: z.array(z.string().refine(isDateOnly, 'leaveErrors.invalidDates')).min(1, 'leaveErrors.selectDates').optional(), // Individual selected dates
  isFullDay: z.boolean().optional(),
  startTime: z.string().nullable().optional(),
  endTime: z.string().nullable().optional(),
  reason: z.string().max(1000).nullable().optional(),
  selectedDaysCount: z.number().int().positive().optional(), // For calendar multi-select
}).superRefine((data, ctx) => {
  const issue = (message: string, path: string) => ctx.addIssue({ code: 'custom', message, path: [path] });
  if (data.endDate < data.startDate) issue('leaveErrors.dateOrder', 'endDate');
  if (data.selectedDates?.some(date => date < data.startDate || date > data.endDate)) issue('leaveErrors.outsideRange', 'selectedDates');
  if (data.selectedDates?.length) {
    const dates = [...new Set(data.selectedDates)].sort();
    if (dates[0] !== data.startDate || dates.at(-1) !== data.endDate) issue('leaveErrors.rangeMismatch', 'selectedDates');
  }
  if (data.isFullDay === false) {
    if (data.startDate !== data.endDate) issue('leaveErrors.partialSingleDay', 'endDate');
    const start = timeMinutes(data.startTime), end = timeMinutes(data.endTime);
    if (start === null || end === null) issue('leaveErrors.timesRequired', 'startTime');
    else if (end <= start) issue('leaveErrors.timeOrder', 'endTime');
  }
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

/** Kept for form previews; all callers use the same arithmetic. */
export function calculateTotalDays(startDate: string, endDate: string, isFullDay: boolean, startTime?: string | null, endTime?: string | null): number {
  return leaveTotalDays({ startDate, endDate, isFullDay, startTime, endTime });
}
