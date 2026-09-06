import { NextRequest, NextResponse, after } from 'next/server';
import { getApiAdminClient, requireApiAdminRole, handleApiError } from '@/lib/supabase/api-helpers';
import { syncTaskSeriesChanges } from '@/lib/task-series-server';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireApiAdminRole();
    const { data, error } = await getApiAdminClient().rpc('apply_task_series_change', {
      p_task_id: id, p_changes: {}, p_delete: true,
    });
    if (error) throw error;
    after(() => syncTaskSeriesChanges(data));
    return NextResponse.json({ success: true, deletedCount: data.deletedIds.length });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
