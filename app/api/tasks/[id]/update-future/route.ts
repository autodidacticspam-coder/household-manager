import { NextRequest, NextResponse, after } from 'next/server';
import { updateTaskSchema } from '@/lib/validators/task';
import { translateTaskContent, type SupportedLocale } from '@/lib/translation/gemini';
import { getApiAdminClient, requireApiAdminRole, handleApiError } from '@/lib/supabase/api-helpers';
import { futureSeriesDates } from '@/lib/task-series';
import { syncTaskSeriesChanges } from '@/lib/task-series-server';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user, userData } = await requireApiAdminRole();
    const result = updateTaskSchema.safeParse(await request.json());
    if (!result.success) return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    const db = getApiAdminClient();
    const { data: task, error } = await db.from('tasks').select('id,series_id,title,description,due_date').eq('id', id).single();
    if (error || !task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    const { assignments, viewers, videos, repeatDays, repeatInterval, repeatEndDate, ...input } = result.data;
    const repeatsChanged = ['repeatDays', 'repeatInterval', 'repeatEndDate'].some(key => Object.hasOwn(result.data, key));
    const hasRepeat = !!repeatDays?.length && !!repeatInterval && !!repeatEndDate;
    if (repeatsChanged && !hasRepeat && (repeatDays?.length || repeatInterval)) {
      return NextResponse.json({ error: 'Complete all repeat settings or turn repeating off' }, { status: 400 });
    }
    if (hasRepeat && !task.due_date) return NextResponse.json({ error: 'A due date is required to update the recurring schedule' }, { status: 400 });
    let seriesId = task.series_id;
    let dates: string[] | null = null;
    if (repeatsChanged) {
      let anchor = task.due_date;
      if (seriesId) {
        const { data: series, error: seriesError } = await db.from('task_series').select('start_date').eq('id', seriesId).single();
        if (seriesError) throw seriesError;
        anchor = series.start_date;
      }
      try {
        dates = hasRepeat ? futureSeriesDates({ repeatDays: repeatDays!, repeatInterval: repeatInterval!, startDate: anchor, endDate: repeatEndDate!, afterDate: task.due_date }) : [];
      } catch (err) {
        return NextResponse.json({ error: (err as Error).message }, { status: 400 });
      }
      if (hasRepeat && !seriesId) {
        const { data, error: seriesError } = await db.rpc('ensure_task_series', {
          p_task_id: id, p_days: repeatDays, p_interval: repeatInterval, p_start: task.due_date, p_end: repeatEndDate,
        });
        if (seriesError) throw seriesError;
        seriesId = data;
      }
    }

    const changes: Record<string, unknown> = {};
    const fields = {
      title: 'title', description: 'description', categoryId: 'category_id', priority: 'priority',
      dueTime: 'due_time', isAllDay: 'is_all_day', isActivity: 'is_activity',
      startTime: 'start_time', endTime: 'end_time', syncToCalendar: 'sync_to_calendar',
    } as const;
    for (const [key, column] of Object.entries(fields)) {
      if (Object.hasOwn(input, key)) changes[column] = input[key as keyof typeof input];
    }
    if (input.title !== undefined || input.description !== undefined) {
      const source = (userData?.preferred_locale || 'en') as SupportedLocale;
      changes.source_locale = source;
      // Clear stale translations if translation is temporarily unavailable.
      if (input.title !== undefined) { changes.title_es = null; changes.title_zh = null; }
      if (input.description !== undefined) { changes.description_es = null; changes.description_zh = null; }
      try {
        const translated = await translateTaskContent(input.title ?? task.title, input.description !== undefined ? input.description : task.description, source);
        if (input.title !== undefined) { changes.title_es = translated.title.es; changes.title_zh = translated.title.zh; }
        if (input.description !== undefined) { changes.description_es = translated.description.es || null; changes.description_zh = translated.description.zh || null; }
      } catch (err) { console.error('Series translation unavailable:', err); }
    }

    const { data: changed, error: changeError } = await db.rpc('apply_task_series_change', {
      p_task_id: id, p_changes: changes, p_dates: dates, p_assignments: assignments ?? null,
      p_viewers: viewers ?? null, p_videos: videos ?? null, p_actor: user.id,
      p_metadata: repeatsChanged ? { repeatDays: repeatDays || [], repeatInterval: repeatInterval || null, repeatEndDate: repeatEndDate || null } : null,
    });
    if (changeError) throw changeError;
    after(() => syncTaskSeriesChanges(changed));
    return NextResponse.json({ success: true, updatedCount: changed.managedIds.length, createdCount: changed.createdIds.length, deletedCount: changed.deletedIds.length });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
