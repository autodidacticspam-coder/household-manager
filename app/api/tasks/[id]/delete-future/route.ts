import { NextRequest, NextResponse, after } from 'next/server';
import { getApiAdminClient, requireApiAdminRole, handleApiError } from '@/lib/supabase/api-helpers';
import { syncEventToConnectedUsers, filterSyncedSourceIds } from '@/lib/google-calendar/sync-service';
import { fetchAllRows } from '@/lib/supabase/pagination';

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
    // Paged: a long-running daily batch exceeds PostgREST's 1000-row cap.
    let batchTasks: { id: string }[];
    try {
      batchTasks = await fetchAllRows<{ id: string }>((from, to) => {
        let batchQuery = supabaseAdmin
          .from('tasks')
          .select('id')
          .eq('title', task.title)
          .eq('created_at', task.created_at);
        // created_by is NULL when the creator's account was deleted, and
        // eq.null never matches a NULL column - it errors on uuid columns
        batchQuery = task.created_by
          ? batchQuery.eq('created_by', task.created_by)
          : batchQuery.is('created_by', null);
        batchQuery = task.due_date
          ? batchQuery.gte('due_date', task.due_date)
          : batchQuery.eq('id', taskId);
        return batchQuery.order('id').range(from, to);
      });
    } catch (batchError) {
      console.error('Error fetching batch tasks:', batchError);
      return NextResponse.json(
        { error: 'Failed to fetch related tasks' },
        { status: 500 }
      );
    }

    if (batchTasks.length === 0) {
      return NextResponse.json(
        { error: 'No tasks found to delete' },
        { status: 404 }
      );
    }

    const taskIdsToDelete = batchTasks.map(t => t.id);

    // Delete with the same batch filter in a single statement. Enumerating
    // the ids in an .in() filter put them all in the request URL, which
    // overflowed the gateway's URL limit (400 Bad Request) once a batch grew
    // past a few hundred rows - that made "delete all future" always fail on
    // large batches while single deletes kept working.
    let deleteQuery = supabaseAdmin
      .from('tasks')
      .delete()
      .eq('title', task.title)
      .eq('created_at', task.created_at);
    deleteQuery = task.created_by
      ? deleteQuery.eq('created_by', task.created_by)
      : deleteQuery.is('created_by', null);
    deleteQuery = task.due_date
      ? deleteQuery.gte('due_date', task.due_date)
      : deleteQuery.eq('id', taskId);
    const { error: deleteError } = await deleteQuery;

    if (deleteError) {
      console.error('Task batch deletion error:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete tasks' },
        { status: 500 }
      );
    }

    // Only remove the Google events once the DB delete is confirmed -
    // dispatching earlier destroyed calendar events for tasks that still
    // existed whenever the delete failed. Restricted to tasks that actually
    // have a synced event so a large batch doesn't dispatch hundreds of
    // no-op syncs.
    after(async () => {
      try {
        const syncedIds = await filterSyncedSourceIds('task', taskIdsToDelete);
        for (const syncedId of syncedIds) {
          await syncEventToConnectedUsers('task', syncedId, 'delete').catch(err =>
            console.error('Calendar sync delete failed:', err)
          );
        }
      } catch (err) {
        console.error('Calendar sync delete failed:', err);
      }
    });

    return NextResponse.json({
      success: true,
      deletedCount: taskIdsToDelete.length
    });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
