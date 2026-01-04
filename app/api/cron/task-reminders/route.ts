import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTaskReminderPush } from '@/lib/notifications/push-service';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const cronSecret = process.env.CRON_SECRET;

export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Calculate time 15 minutes from now
    const targetTime = new Date(now.getTime() + 15 * 60 * 1000);

    // Allow a 1-minute window around the target time (cron runs every minute)
    const windowStart = new Date(targetTime.getTime() - 30 * 1000).toTimeString().slice(0, 8);
    const windowEnd = new Date(targetTime.getTime() + 30 * 1000).toTimeString().slice(0, 8);

    // Find high/urgent priority tasks due within the time window that are not completed
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select(`
        id,
        title,
        description,
        priority,
        due_date,
        due_time,
        status,
        task_assignments (
          target_type,
          target_user_id,
          target_group_id
        )
      `)
      .eq('due_date', today)
      .in('priority', ['medium', 'high', 'urgent'])
      .neq('status', 'completed')
      .not('due_time', 'is', null)
      .gte('due_time', windowStart)
      .lte('due_time', windowEnd);

    if (tasksError) {
      console.error('Error fetching tasks:', tasksError);
      return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
    }

    if (!tasks || tasks.length === 0) {
      return NextResponse.json({ message: 'No tasks due soon', tasksFound: 0 });
    }

    let pushSentCount = 0;
    let pushFailedCount = 0;

    for (const task of tasks) {
      const assignments = (task.task_assignments || []).map((a: {
        target_type: string;
        target_user_id: string | null;
        target_group_id: string | null;
      }) => ({
        targetType: a.target_type as 'user' | 'group' | 'all',
        targetUserId: a.target_user_id || undefined,
        targetGroupId: a.target_group_id || undefined,
      }));

      // Get user IDs for push notifications
      const assignedUserIds: string[] = [];
      for (const a of assignments) {
        if (a.targetType === 'user' && a.targetUserId) {
          assignedUserIds.push(a.targetUserId);
        } else if (a.targetType === 'group' && a.targetGroupId) {
          const { data: members } = await supabase
            .from('employee_group_memberships')
            .select('user_id')
            .eq('group_id', a.targetGroupId);
          if (members) {
            assignedUserIds.push(...members.map(m => m.user_id));
          }
        } else if (a.targetType === 'all') {
          const { data: users } = await supabase
            .from('users')
            .select('id')
            .neq('role', 'admin');
          if (users) {
            assignedUserIds.push(...users.map(u => u.id));
          }
        }
      }

      // Send push notification
      if (assignedUserIds.length > 0) {
        try {
          const pushResult = await sendTaskReminderPush(
            [...new Set(assignedUserIds)],
            task.title,
            task.id,
            task.priority,
            task.description,
            task.due_date,
            task.due_time
          );
          pushSentCount += pushResult.sent;
          pushFailedCount += pushResult.failed;
        } catch (err) {
          console.error('Failed to send reminder push:', err);
        }
      }
    }

    return NextResponse.json({
      message: 'Reminder check completed',
      tasksFound: tasks.length,
      pushRemindersSent: pushSentCount,
      pushRemindersFailed: pushFailedCount,
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Vercel Cron configuration
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
