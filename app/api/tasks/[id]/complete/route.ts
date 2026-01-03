import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getApiAdminClient } from '@/lib/supabase/api-helpers';
import { sendTaskCompletedPush } from '@/lib/notifications/push-service';

// POST handler for completing a task
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const supabase = await createClient();
    const supabaseAdmin = getApiAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get task title and user info before completing
    const { data: task } = await supabaseAdmin
      .from('tasks')
      .select('title')
      .eq('id', taskId)
      .single();

    const { data: completingUser } = await supabaseAdmin
      .from('users')
      .select('full_name')
      .eq('id', user.id)
      .single();

    const { error } = await supabaseAdmin
      .from('tasks')
      .update({
        status: 'completed',
        completed_by: user.id,
        completed_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    if (error) {
      console.error('Task completion error:', error);
      return NextResponse.json({ error: 'Failed to complete task' }, { status: 500 });
    }

    // Notify admins about task completion (non-blocking)
    if (task && completingUser) {
      const { data: admins } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('role', 'admin')
        .neq('id', user.id); // Don't notify the completer if they're an admin

      if (admins && admins.length > 0) {
        sendTaskCompletedPush(
          admins.map(a => a.id),
          task.title,
          taskId,
          completingUser.full_name
        ).catch(err => {
          console.error('Failed to send task completed push:', err);
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Task completion error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
