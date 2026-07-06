import { NextResponse, after } from 'next/server';
import { requireApiAdminRole, getApiAdminClient, handleApiError } from '@/lib/supabase/api-helpers';
import { syncScheduleOverrideChange } from '@/lib/google-calendar/sync-service';

export async function POST(request: Request) {
  try {
    const { user } = await requireApiAdminRole();

    const body = await request.json();
    const { scheduleId, overrideDate, startTime, endTime, isCancelled, notes } = body;

    if (!scheduleId || !overrideDate) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getApiAdminClient();

    const { data: existing } = await supabase
      .from('schedule_overrides')
      .select('id')
      .eq('schedule_id', scheduleId)
      .eq('override_date', overrideDate)
      .single();

    let result;
    let action: 'create' | 'update' = 'create';

    if (existing) {
      action = 'update';
      const { data, error } = await supabase
        .from('schedule_overrides')
        .update({
          start_time: isCancelled ? null : startTime,
          end_time: isCancelled ? null : endTime,
          is_cancelled: isCancelled || false,
          notes,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating schedule override:', error);
        return NextResponse.json({ error: 'Failed to update override' }, { status: 500 });
      }

      result = data;
    } else {
      const { data, error } = await supabase
        .from('schedule_overrides')
        .insert({
          schedule_id: scheduleId,
          override_date: overrideDate,
          start_time: isCancelled ? null : startTime,
          end_time: isCancelled ? null : endTime,
          is_cancelled: isCancelled || false,
          notes,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating schedule override:', error);
        return NextResponse.json({ error: 'Failed to create override' }, { status: 500 });
      }

      result = data;
    }

    after(syncScheduleOverrideChange(scheduleId, overrideDate, action, {
      startTime: isCancelled ? null : startTime,
      endTime: isCancelled ? null : endTime,
      isCancelled: isCancelled || false,
    }).catch((err) => console.error('Error syncing schedule override to Google Calendar:', err)));

    return NextResponse.json(result);
  } catch (error) {
    const { error: message, status } = handleApiError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    await requireApiAdminRole();

    const { searchParams } = new URL(request.url);
    const scheduleId = searchParams.get('scheduleId');
    const overrideDate = searchParams.get('overrideDate');

    if (!scheduleId || !overrideDate) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const supabase = getApiAdminClient();

    const { error } = await supabase
      .from('schedule_overrides')
      .delete()
      .eq('schedule_id', scheduleId)
      .eq('override_date', overrideDate);

    if (error) {
      console.error('Error deleting schedule override:', error);
      return NextResponse.json({ error: 'Failed to delete override' }, { status: 500 });
    }

    after(syncScheduleOverrideChange(scheduleId, overrideDate, 'delete').catch((err) =>
      console.error('Error syncing schedule override deletion to Google Calendar:', err)
    ));

    return NextResponse.json({ success: true });
  } catch (error) {
    const { error: message, status } = handleApiError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
