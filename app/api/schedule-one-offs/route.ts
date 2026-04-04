import { NextResponse } from 'next/server';
import { getApiAuthUser, getApiAdminClient } from '@/lib/supabase/api-helpers';
import { syncOneOffScheduleChange } from '@/lib/google-calendar/sync-service';

export async function POST(request: Request) {
  try {
    const user = await getApiAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { userId, scheduleDate, startTime, endTime } = body;

    if (!userId || !scheduleDate || !startTime || !endTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getApiAdminClient();

    const { data: schedule, error } = await supabase
      .from('schedule_one_offs')
      .insert({
        user_id: userId,
        schedule_date: scheduleDate,
        start_time: startTime,
        end_time: endTime,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating one-off schedule:', error);
      return NextResponse.json({ error: 'Failed to create schedule' }, { status: 500 });
    }

    syncOneOffScheduleChange(schedule.id, 'create', {
      userId,
      scheduleDate,
      startTime,
      endTime,
    }).catch((err) => console.error('Error syncing one-off schedule to Google Calendar:', err));

    return NextResponse.json(schedule);
  } catch (error) {
    console.error('Error in POST /api/schedule-one-offs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
