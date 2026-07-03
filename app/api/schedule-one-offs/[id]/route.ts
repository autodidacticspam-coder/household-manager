import { NextResponse } from 'next/server';
import { requireApiAdminRole, getApiAdminClient, handleApiError } from '@/lib/supabase/api-helpers';
import { syncOneOffScheduleChange } from '@/lib/google-calendar/sync-service';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireApiAdminRole();

    const { id } = await params;
    const body = await request.json();
    const { startTime, endTime, scheduleDate } = body;

    if (!startTime || !endTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getApiAdminClient();

    const { data: existing } = await supabase
      .from('schedule_one_offs')
      .select('user_id, schedule_date')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
    }

    const updateData: Record<string, string> = {
      start_time: startTime,
      end_time: endTime,
    };

    if (scheduleDate) {
      updateData.schedule_date = scheduleDate;
    }

    const { data: schedule, error } = await supabase
      .from('schedule_one_offs')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating one-off schedule:', error);
      return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
    }

    syncOneOffScheduleChange(id, 'update', {
      userId: existing.user_id,
      scheduleDate: scheduleDate || existing.schedule_date,
      startTime,
      endTime,
    }).catch((err) => console.error('Error syncing one-off schedule to Google Calendar:', err));

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
      .from('schedule_one_offs')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting one-off schedule:', error);
      return NextResponse.json({ error: 'Failed to delete schedule' }, { status: 500 });
    }

    syncOneOffScheduleChange(id, 'delete').catch((err) =>
      console.error('Error syncing one-off schedule deletion to Google Calendar:', err)
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const { error: message, status } = handleApiError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
