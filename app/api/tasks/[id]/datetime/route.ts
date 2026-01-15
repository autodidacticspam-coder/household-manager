import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getApiAdminClient } from '@/lib/supabase/api-helpers';
import { syncEventToConnectedUsers } from '@/lib/google-calendar/sync-service';

// PUT handler for updating task date/time (for drag and drop of regular tasks)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const { dueDate, dueTime, startTime, endTime } = await request.json();

    if (!dueDate) {
      return NextResponse.json({ error: 'dueDate is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const supabaseAdmin = getApiAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user is admin
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can move tasks' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {
      due_date: dueDate,
      due_time: dueTime ?? null,
    };

    if (startTime !== undefined) {
      updateData.start_time = startTime;
    }
    if (endTime !== undefined) {
      updateData.end_time = endTime;
    }

    const { error } = await supabaseAdmin
      .from('tasks')
      .update(updateData)
      .eq('id', taskId);

    if (error) {
      console.error('Task date/time update error:', error);
      return NextResponse.json({ error: 'Failed to update task date/time' }, { status: 500 });
    }

    // Sync updated task to Google Calendar
    const { data: updatedTask } = await supabaseAdmin
      .from('tasks')
      .select('id, title, description, due_date, due_time, is_all_day, is_activity, start_time, end_time, status, priority')
      .eq('id', taskId)
      .single();

    if (updatedTask) {
      syncEventToConnectedUsers('task', taskId, 'update', {
        id: updatedTask.id,
        title: updatedTask.title,
        description: updatedTask.description,
        dueDate: updatedTask.due_date,
        dueTime: updatedTask.due_time,
        isAllDay: updatedTask.is_all_day,
        isActivity: updatedTask.is_activity,
        startTime: updatedTask.start_time,
        endTime: updatedTask.end_time,
        status: updatedTask.status,
        priority: updatedTask.priority,
      }).catch(err => console.error('Calendar sync update failed:', err));
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Task date/time update error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
