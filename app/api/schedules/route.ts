import { NextResponse, after } from 'next/server';
import { requireApiAdminRole, getApiAdminClient, handleApiError } from '@/lib/supabase/api-helpers';
import { syncBaseScheduleChange } from '@/lib/google-calendar/sync-service';

export async function POST(request: Request) {
  try {
    // Schedules are admin-managed; the RLS-bypassing admin client below must
    // be gated on the admin role, not just any signed-in user.
    await requireApiAdminRole();

    const body = await request.json();
    const { userId, dayOfWeek, startTime, endTime } = body;

    if (!userId || dayOfWeek === undefined || !startTime || !endTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getApiAdminClient();

    const { data: schedule, error } = await supabase
      .from('employee_schedules')
      .insert({
        user_id: userId,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating schedule:', error);
      return NextResponse.json({ error: 'Failed to create schedule' }, { status: 500 });
    }

    after(syncBaseScheduleChange(schedule.id, 'create', {
      userId,
      dayOfWeek,
      startTime,
      endTime,
    }).catch((err) => console.error('Error syncing schedule to Google Calendar:', err)));

    return NextResponse.json(schedule);
  } catch (error) {
    const { error: message, status } = handleApiError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
