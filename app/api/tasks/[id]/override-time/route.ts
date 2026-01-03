import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getApiAdminClient } from '@/lib/supabase/api-helpers';

// PUT handler for overriding time for a specific instance of a recurring task (for drag and drop)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const { instanceDate, overrideTime, overrideStartTime, overrideEndTime } = await request.json();

    if (!instanceDate) {
      return NextResponse.json({ error: 'instanceDate is required' }, { status: 400 });
    }

    const supabase = await createClient();
    const supabaseAdmin = getApiAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user is admin
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can override task instance times' }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from('task_instance_overrides')
      .upsert({
        task_id: taskId,
        instance_date: instanceDate,
        override_time: overrideTime ?? null,
        override_start_time: overrideStartTime ?? null,
        override_end_time: overrideEndTime ?? null,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'task_id,instance_date',
      });

    if (error) {
      console.error('Task instance override error:', error);
      return NextResponse.json({ error: 'Failed to override task instance time' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Task instance override error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
