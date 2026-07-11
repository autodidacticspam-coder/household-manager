import { NextResponse, after } from 'next/server';
import { requireApiAdminRole, getApiAdminClient, handleApiError } from '@/lib/supabase/api-helpers';
import { syncOneOffScheduleChange } from '@/lib/google-calendar/sync-service';

export async function POST(request: Request) {
  try {
    const { user } = await requireApiAdminRole();

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
      // Unique violation only occurs while migration 036 (which removes the
      // one-shift-per-day constraint) hasn't been applied yet
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'This person already has a shift that day. Apply migration 036 to allow split shifts.' },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: 'Failed to create schedule' }, { status: 500 });
    }

    after(syncOneOffScheduleChange(schedule.id, 'create', {
      userId,
      scheduleDate,
      startTime,
      endTime,
    }).catch((err) => console.error('Error syncing one-off schedule to Google Calendar:', err)));

    return NextResponse.json(schedule);
  } catch (error) {
    const { error: message, status } = handleApiError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
