import { NextRequest, NextResponse } from 'next/server';
import { requireTaskPermission } from '@/lib/task-permissions';
import { handleApiError } from '@/lib/supabase/api-helpers';

// POST handler for completing a recurring task instance
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const { completionDate } = await request.json();

    if (!completionDate) {
      return NextResponse.json({ error: 'completionDate is required' }, { status: 400 });
    }

    const { user, supabase } = await requireTaskPermission(taskId, 'complete');

    // Insert completion record (upsert in case of re-completion)
    const { error } = await supabase
      .from('task_completions')
      .upsert({
        task_id: taskId,
        completion_date: completionDate,
        completed_by: user.id,
        completed_at: new Date().toISOString(),
      }, {
        onConflict: 'task_id,completion_date',
      });

    if (error) {
      console.error('Task instance completion error:', error);
      return NextResponse.json({ error: 'Failed to complete task instance' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Task instance completion error:', err);
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}

// DELETE handler for uncompleting a recurring task instance
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const { searchParams } = new URL(request.url);
    const completionDate = searchParams.get('completionDate');

    if (!completionDate) {
      return NextResponse.json({ error: 'completionDate is required' }, { status: 400 });
    }

    const { supabase } = await requireTaskPermission(taskId, 'complete');

    const { error } = await supabase
      .from('task_completions')
      .delete()
      .eq('task_id', taskId)
      .eq('completion_date', completionDate);

    if (error) {
      console.error('Task instance uncomplete error:', error);
      return NextResponse.json({ error: 'Failed to uncomplete task instance' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Task instance uncomplete error:', err);
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
