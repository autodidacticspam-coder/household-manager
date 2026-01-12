import { NextRequest, NextResponse } from 'next/server';
import { getApiAdminClient, getApiAuthUser, handleApiError } from '@/lib/supabase/api-helpers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;

    // Just check if user is authenticated (not necessarily admin)
    const user = await getApiAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabaseAdmin = getApiAdminClient();

    const today = new Date().toISOString().split('T')[0];

    // Get the task
    const { data: task, error: taskError } = await supabaseAdmin
      .from('tasks')
      .select('id, title, due_date, created_at, created_by')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return NextResponse.json(
        { isRepeating: false, batchSize: 0, futureCount: 0 },
        { status: 200 }
      );
    }

    // Extract the date portion of created_at for batch matching
    // This matches how the client groups tasks into batches
    const createdDate = task.created_at?.slice(0, 10) || '';

    // Find all tasks with same title, created_by, AND same created_at date
    // This is the same batch key logic used in useTasks client-side
    let query = supabaseAdmin
      .from('tasks')
      .select('id, due_date, status, created_at')
      .eq('title', task.title);

    if (task.created_by) {
      query = query.eq('created_by', task.created_by);
    }

    const { data: allTasksWithTitle, error: batchError } = await query;

    if (batchError || !allTasksWithTitle) {
      return NextResponse.json(
        { isRepeating: false, batchSize: 0, futureCount: 0 },
        { status: 200 }
      );
    }

    // Filter to only tasks in the same batch (same created_at date)
    const batchTasks = allTasksWithTitle.filter(t => {
      const taskCreatedDate = t.created_at?.slice(0, 10) || '';
      return taskCreatedDate === createdDate;
    });

    // Count future pending/in_progress tasks (not completed)
    const futureCount = batchTasks.filter(t =>
      t.due_date &&
      t.due_date >= today &&
      t.status !== 'completed'
    ).length;

    return NextResponse.json({
      isRepeating: batchTasks.length > 1,
      batchSize: batchTasks.length,
      futureCount,
    });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
