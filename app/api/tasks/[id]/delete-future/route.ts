import { NextRequest, NextResponse, after } from 'next/server';
import { getApiAdminClient, requireApiAdminRole, handleApiError } from '@/lib/supabase/api-helpers';
import { syncEventToConnectedUsers } from '@/lib/google-calendar/sync-service';

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

    // Find all tasks in the same batch with due_date >= this task's due_date.
    // Batch rows are inserted with one exact created_at timestamp, so match
    // it exactly - matching only the date merged two distinct same-titled
    // batches created on the same day and deleted the other batch's tasks.
    // A NULL-due_date task has no "future" siblings and NULL fails the gte
    // filter, so restrict to just this task in that case.
    let batchQuery = supabaseAdmin
      .from('tasks')
      .select('id, due_date, created_at, created_by')
      .eq('title', task.title)
      .eq('created_by', task.created_by)
      .eq('created_at', task.created_at);
    batchQuery = task.due_date
      ? batchQuery.gte('due_date', task.due_date)
      : batchQuery.eq('id', taskId);
    const { data: batchTasks, error: batchError } = await batchQuery;

    if (batchError) {
      console.error('Error fetching batch tasks:', batchError);
      return NextResponse.json(
        { error: 'Failed to fetch related tasks' },
        { status: 500 }
      );
    }

    const tasksToDelete = batchTasks || [];

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

    // Only remove the Google events once the DB delete is confirmed -
    // dispatching earlier destroyed calendar events for tasks that still
    // existed whenever the delete failed.
    for (const deletingTaskId of taskIdsToDelete) {
      after(syncEventToConnectedUsers('task', deletingTaskId, 'delete').catch(err =>
        console.error('Calendar sync delete failed:', err)
      ));
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
