import { NextResponse } from 'next/server';
import { getApiAuthUser, getApiAdminClient } from '@/lib/supabase/api-helpers';
import { syncBaseScheduleChange } from '@/lib/google-calendar/sync-service';

export async function POST(request: Request) {
  try {
    const user = await getApiAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    syncBaseScheduleChange(schedule.id, 'create', {
      userId,
      dayOfWeek,
      startTime,
      endTime,
    }).catch((err) => console.error('Error syncing schedule to Google Calendar:', err));

    return NextResponse.json(schedule);
  } catch (error) {
    console.error('Error in POST /api/schedules:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
