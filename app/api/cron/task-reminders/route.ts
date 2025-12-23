import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTaskDueReminderNotification, getTaskAssigneePhones } from '@/lib/notifications/task-notifications';
import { sendBulkSms } from '@/lib/twilio/sms-service';

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
    const targetTimeStr = targetTime.toTimeString().slice(0, 8);

    // Allow a 5-minute window around the target time
    const windowStart = new Date(targetTime.getTime() - 2.5 * 60 * 1000).toTimeString().slice(0, 8);
    const windowEnd = new Date(targetTime.getTime() + 2.5 * 60 * 1000).toTimeString().slice(0, 8);

    console.log(`Checking for tasks due between ${windowStart} and ${windowEnd} on ${today}`);

    // Find high/urgent priority tasks due within the time window that are not completed
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select(`
        id,
        title,
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
      .in('priority', ['high', 'urgent'])
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

    console.log(`Found ${tasks.length} tasks due soon`);

    // Check which tasks haven't had a reminder sent in the last 20 minutes
    const twentyMinsAgo = new Date(now.getTime() - 20 * 60 * 1000).toISOString();

    const { data: recentReminders } = await supabase
      .from('sms_notifications')
      .select('message')
      .eq('notification_type', 'task_due_reminder')
      .gte('created_at', twentyMinsAgo);

    // Build a set of task titles that have had reminders sent
    const remindedTitles = new Set(
      recentReminders?.map(n => {
        // Extract title from message format "[REMINDER] PRIORITY priority task due soon: TITLE"
        const match = n.message.match(/task due soon: (.+?)(?:\s*-|$)/);
        return match ? match[1] : null;
      }).filter(Boolean) || []
    );

    let sentCount = 0;
    let failedCount = 0;

    for (const task of tasks) {
      // Skip if reminder was already sent for this task
      if (remindedTitles.has(task.title)) {
        console.log(`Skipping reminder for task "${task.title}" - already sent recently`);
        continue;
      }

      const assignments = (task.task_assignments || []).map((a: {
        target_type: string;
        target_user_id: string | null;
        target_group_id: string | null;
      }) => ({
        targetType: a.target_type as 'user' | 'group' | 'all',
        targetUserId: a.target_user_id || undefined,
        targetGroupId: a.target_group_id || undefined,
      }));

      const recipients = await getTaskAssigneePhones(assignments);

      if (recipients.length === 0) {
        console.log(`No recipients for task "${task.title}"`);
        continue;
      }

      const priorityLabel = task.priority.toUpperCase();
      let message = `[REMINDER] ${priorityLabel} priority task due soon: ${task.title}`;

      if (task.due_time) {
        const [hours, minutes] = task.due_time.split(':');
        const hour = parseInt(hours, 10);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        message += ` - Due at ${hour12}:${minutes} ${ampm}`;
      }

      const result = await sendBulkSms(
        recipients.map(r => ({ phoneNumber: r.phoneNumber, userId: r.userId })),
        message,
        'task_due_reminder'
      );

      sentCount += result.sent;
      failedCount += result.failed;

      console.log(`Sent reminder for task "${task.title}": ${result.sent} sent, ${result.failed} failed`);
    }

    return NextResponse.json({
      message: 'Reminder check completed',
      tasksFound: tasks.length,
      remindersSent: sentCount,
      remindersFailed: failedCount,
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
