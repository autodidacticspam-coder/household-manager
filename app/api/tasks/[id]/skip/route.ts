import { NextRequest, NextResponse } from 'next/server';
import { getApiAdminClient, requireApiAdminRole, handleApiError } from '@/lib/supabase/api-helpers';

// POST handler for skipping a task instance
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const { skipDate } = await request.json();

    if (!skipDate) {
      return NextResponse.json(
        { error: 'skipDate is required' },
        { status: 400 }
      );
    }

    const { user } = await requireApiAdminRole();
    const supabaseAdmin = getApiAdminClient();

    const { error } = await supabaseAdmin
      .from('task_skipped_instances')
      .upsert({
        task_id: taskId,
        skipped_date: skipDate,
        skipped_by: user.id,
        skipped_at: new Date().toISOString(),
      }, {
        onConflict: 'task_id,skipped_date',
      });

    if (error) {
      console.error('Task instance skip error:', error);
      return NextResponse.json(
        { error: 'Failed to skip task instance' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
