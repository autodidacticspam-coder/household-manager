import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createLeaveRequestSchema } from '@/lib/validators/leave';
import { leaveDates, leaveTotalDays } from '@/lib/leave-dates';
import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';

export type LeaveResult = { success?: boolean; error?: string; status?: number; data?: Record<string, unknown> };

export async function saveLeave(action: 'create' | 'approve' | 'deny' | 'cancel', input: unknown): Promise<LeaveResult> {
  const t = await getTranslations();
  const fail = (message: string, status = 400): LeaveResult => ({ error: t.has(message) ? t(message) : t('leaveErrors.saveFailed'), status });
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return fail('leaveErrors.signIn', 401);
    let id: string;
    if (action === 'create') {
      const result = createLeaveRequestSchema.safeParse(input);
      if (!result.success) return fail(result.error.issues[0].message);
      const leave = result.data;
      const { data, error } = await db.from('leave_requests').insert({
        user_id: user.id, leave_type: leave.leaveType,
        start_date: leave.startDate, end_date: leave.endDate, selected_dates: leaveDates(leave),
        is_full_day: leave.isFullDay ?? true,
        start_time: leave.isFullDay === false ? leave.startTime : null,
        end_time: leave.isFullDay === false ? leave.endTime : null,
        total_days: leaveTotalDays(leave), reason: leave.reason || null,
      }).select('id').single();
      if (error) throw error;
      id = data.id;
    } else {
      const result = z.object({ id: z.string().uuid(), adminNotes: z.string().max(1000).optional() }).safeParse(input);
      if (!result.success) return fail('leaveErrors.invalidRequest');
      const { data, error } = await db.rpc('review_leave_request', { p_request_id: result.data.id, p_action: action, p_notes: result.data.adminNotes || null });
      if (error) throw error;
      id = data;
    }
    for (const path of ['/time-off', '/leave-requests', '/dashboard', '/calendar', '/my-calendar']) revalidatePath(path);
    return { success: true, data: { id } };
  } catch (err) {
    const error = err as { message?: string; code?: string };
    if (error.message?.startsWith('leaveErrors.')) return fail(error.message, error.code === '42501' ? 403 : error.code === 'P0002' ? 404 : 400);
    console.error('Leave mutation failed:', err);
    return fail('leaveErrors.saveFailed', 500);
  }
}
