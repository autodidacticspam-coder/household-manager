import { getZonedDateString } from '@/lib/timezone';
import { requireTaskPermission } from '@/lib/task-permissions';
import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/supabase/api-helpers';
import { inferRepeatSettings } from '@/lib/task-generator';
import { fetchAllRows } from '@/lib/supabase/pagination';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;

    const { supabase: supabaseAdmin } = await requireTaskPermission(taskId, 'view');

    const today = getZonedDateString(new Date());

    // Get the task
    const { data: task, error: taskError } = await supabaseAdmin
      .from('tasks')
      .select('id, series_id, due_date')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return NextResponse.json(
        { isRepeating: false, batchSize: 0, futureCount: 0 },
        { status: 200 }
      );
    }

    const batchTasks = await fetchAllRows<{ id: string; due_date: string | null; status: string }>((from, to) => {
      const query = supabaseAdmin.from('tasks').select('id, due_date, status');
      return (task.series_id ? query.eq('series_id', task.series_id) : query.eq('id', task.id))
        .order('due_date', { ascending: true }).order('id').range(from, to);
    });
    const { data: series } = task.series_id
      ? await supabaseAdmin.from('task_series').select('repeat_days, repeat_interval, end_date').eq('id', task.series_id).single()
      : { data: null };

    // Count future pending/in_progress tasks (not completed)
    const futureCount = batchTasks.filter(t =>
      t.due_date &&
      t.due_date >= today &&
      t.status !== 'completed'
    ).length;
    const repeatSettings = inferRepeatSettings(batchTasks.map((t) => t.due_date as string | null));

    return NextResponse.json({
      isRepeating: !!task.series_id,
      batchSize: batchTasks.length,
      futureCount,
      repeatDays: series?.repeat_days ?? repeatSettings?.repeatDays ?? null,
      repeatInterval: series?.repeat_interval ?? repeatSettings?.repeatInterval ?? null,
      repeatEndDate: series?.end_date ?? repeatSettings?.repeatEndDate ?? null,
    });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
