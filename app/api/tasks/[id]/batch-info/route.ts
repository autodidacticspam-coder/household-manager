import { NextRequest, NextResponse } from 'next/server';
import { getApiAdminClient, getApiAuthUser, handleApiError } from '@/lib/supabase/api-helpers';
import { inferRepeatSettings } from '@/lib/task-generator';
import { fetchAllRows } from '@/lib/supabase/pagination';

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

    // Batch rows share one exact created_at timestamp by construction;
    // matching only the date merged distinct same-titled batches created
    // on the same day.
    // Paged: a long-running daily batch exceeds PostgREST's 1000-row cap,
    // and a truncated fetch undercounts the batch.
    let batchTasks: { id: string; due_date: string | null; status: string }[];
    try {
      batchTasks = await fetchAllRows<{ id: string; due_date: string | null; status: string }>((from, to) => {
        let query = supabaseAdmin
          .from('tasks')
          .select('id, due_date, status')
          .eq('title', task.title)
          .eq('created_at', task.created_at);

        if (task.created_by) {
          query = query.eq('created_by', task.created_by);
        } else {
          query = query.is('created_by', null);
        }

        return query.order('due_date', { ascending: true }).order('id').range(from, to);
      });
    } catch {
      return NextResponse.json(
        { isRepeating: false, batchSize: 0, futureCount: 0 },
        { status: 200 }
      );
    }

    // Count future pending/in_progress tasks (not completed)
    const futureCount = batchTasks.filter(t =>
      t.due_date &&
      t.due_date >= today &&
      t.status !== 'completed'
    ).length;
    const repeatSettings = inferRepeatSettings(batchTasks.map((t) => t.due_date as string | null));

    return NextResponse.json({
      isRepeating: batchTasks.length > 1,
      batchSize: batchTasks.length,
      futureCount,
      repeatDays: repeatSettings?.repeatDays ?? null,
      repeatInterval: repeatSettings?.repeatInterval ?? null,
      repeatEndDate: repeatSettings?.repeatEndDate ?? null,
    });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
