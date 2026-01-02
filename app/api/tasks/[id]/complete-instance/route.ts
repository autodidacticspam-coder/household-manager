import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getApiAdminClient } from '@/lib/supabase/api-helpers';

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

    const supabase = await createClient();
    const supabaseAdmin = getApiAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Insert completion record (upsert in case of re-completion)
    const { error } = await supabaseAdmin
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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

    const supabase = await createClient();
    const supabaseAdmin = getApiAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { error } = await supabaseAdmin
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
