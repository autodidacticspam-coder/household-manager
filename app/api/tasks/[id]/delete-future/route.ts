import { NextRequest, NextResponse } from 'next/server';
import { getApiAdminClient, requireApiAdminRole, handleApiError } from '@/lib/supabase/api-helpers';

// DELETE handler for deleting a task and all future instances in the same batch
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;

    await requireApiAdminRole();
    const supabaseAdmin = getApiAdminClient();

    // First, get the task to find its batch info (title + created_by + created_at date)
    const { data: task, error: fetchError } = await supabaseAdmin
      .from('tasks')
      .select('id, title, due_date, created_at, created_by')
      .eq('id', taskId)
      .single();

    if (fetchError || !task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    // Find all tasks in the same batch (same title + created_by + date) with due_date >= this task's due_date
    // Use date only (10 chars: YYYY-MM-DD) to handle timestamp variations
    const createdDate = task.created_at?.slice(0, 10) || '';

    // Get all tasks with same title, created_by, and future due_date
    const { data: batchTasks, error: batchError } = await supabaseAdmin
      .from('tasks')
      .select('id, due_date, created_at, created_by')
      .eq('title', task.title)
      .eq('created_by', task.created_by)
      .gte('due_date', task.due_date || '1970-01-01');

    if (batchError) {
      console.error('Error fetching batch tasks:', batchError);
      return NextResponse.json(
        { error: 'Failed to fetch related tasks' },
        { status: 500 }
      );
    }

    // Filter to only tasks in the same batch (matching created_at date)
    const tasksToDelete = (batchTasks || []).filter(t => {
      const tCreatedDate = t.created_at?.slice(0, 10) || '';
      return tCreatedDate === createdDate;
    });

    if (tasksToDelete.length === 0) {
      return NextResponse.json(
        { error: 'No tasks found to delete' },
        { status: 404 }
      );
    }

    const taskIdsToDelete = tasksToDelete.map(t => t.id);

    // Delete all the tasks
    const { error: deleteError } = await supabaseAdmin
      .from('tasks')
      .delete()
      .in('id', taskIdsToDelete);

    if (deleteError) {
      console.error('Task batch deletion error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete tasks' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deletedCount: taskIdsToDelete.length
    });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
