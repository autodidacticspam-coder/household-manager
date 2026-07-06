import { NextResponse, after } from 'next/server';
import { requireApiAdminRole, getApiAdminClient, handleApiError } from '@/lib/supabase/api-helpers';
import { syncBaseScheduleChange } from '@/lib/google-calendar/sync-service';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireApiAdminRole();

    const { id } = await params;
    const body = await request.json();
    const { dayOfWeek, startTime, endTime, userId } = body;

    if (dayOfWeek === undefined || !startTime || !endTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getApiAdminClient();

    const { data: existingSchedule } = await supabase
      .from('employee_schedules')
      .select('user_id')
      .eq('id', id)
      .single();

    if (!existingSchedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    const { data: schedule, error } = await supabase
      .from('employee_schedules')
      .update({
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating schedule:', error);
      return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
    }

    after(syncBaseScheduleChange(id, 'update', {
      userId: userId || existingSchedule.user_id,
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireApiAdminRole();

    const { id } = await params;
    const supabase = getApiAdminClient();

    const { error } = await supabase
      .from('employee_schedules')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting schedule:', error);
      return NextResponse.json({ error: 'Failed to delete schedule' }, { status: 500 });
    }

    after(syncBaseScheduleChange(id, 'delete').catch((err) =>
      console.error('Error syncing schedule deletion to Google Calendar:', err)
    ));

    return NextResponse.json({ success: true });
  } catch (error) {
    const { error: message, status } = handleApiError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
