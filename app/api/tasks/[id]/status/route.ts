import { NextRequest, NextResponse } from 'next/server';
import { requireTaskPermission } from '@/lib/task-permissions';
import { handleApiError } from '@/lib/supabase/api-helpers';

// PUT handler for updating task status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const { status } = await request.json();

    if (!status || !['pending', 'in_progress', 'completed'].includes(status)) {
      return NextResponse.json({ error: 'Valid status is required' }, { status: 400 });
    }

    const { user, supabase } = await requireTaskPermission(taskId, 'complete');

    const updateData: Record<string, unknown> = { status };

    if (status === 'completed') {
      updateData.completed_by = user.id;
      updateData.completed_at = new Date().toISOString();
    } else {
      updateData.completed_by = null;
      updateData.completed_at = null;
    }

    const { error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', taskId)
      .select('id')
      .single();

    if (error) {
      console.error('Task status update error:', error);
      return NextResponse.json({ error: 'Failed to update task status' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Task status update error:', err);
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
