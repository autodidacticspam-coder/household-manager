import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  createLeaveRequestSchema,
  calculateTotalDays,
} from '@/lib/validators/leave';

// POST handler for creating a leave request
export async function POST(request: NextRequest) {
  try {
    const input = await request.json();

    // Validate input
    const result = createLeaveRequestSchema.safeParse(input);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const data = result.data;
    const isFullDay = data.isFullDay ?? true;
    const totalDays = isFullDay
      ? (data.selectedDaysCount || calculateTotalDays(data.startDate, data.endDate, true))
      : calculateTotalDays(data.startDate, data.endDate, false, data.startTime, data.endTime);

    const { data: leaveRequest, error } = await supabase
      .from('leave_requests')
      .insert({
        user_id: user.id,
        leave_type: data.leaveType,
        start_date: data.startDate,
        end_date: data.endDate,
        selected_dates: data.selectedDates || null,
        is_full_day: isFullDay,
        start_time: isFullDay ? null : data.startTime,
        end_time: isFullDay ? null : data.endTime,
        total_days: totalDays,
        reason: data.reason || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Leave request creation error:', error);
      return NextResponse.json({ error: 'Failed to create leave request' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { id: leaveRequest.id } });
  } catch (err) {
    console.error('Leave request creation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
