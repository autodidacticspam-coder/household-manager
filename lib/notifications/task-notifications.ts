import { createClient } from '@supabase/supabase-js';
import { sendBulkSms } from '@/lib/twilio/sms-service';
import { formatTime12h } from '@/lib/format-time';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type TaskAssignment = {
  targetType: 'user' | 'group' | 'all' | 'all_admins';
  targetUserId?: string | null;
  targetGroupId?: string | null;
};

type TaskInfo = {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  dueTime?: string;
  assignments: TaskAssignment[];
};

type Recipient = {
  userId: string;
  phoneNumber: string;
  fullName: string;
};

export async function getTaskAssigneePhones(
  assignments: TaskAssignment[]
): Promise<Recipient[]> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const recipientMap = new Map<string, Recipient>();

  for (const assignment of assignments) {
    if (assignment.targetType === 'user' && assignment.targetUserId) {
      // Direct user assignment
      const { data: user } = await supabase
        .from('users')
        .select('id, full_name, phone, sms_notifications_enabled')
        .eq('id', assignment.targetUserId)
        .single();

      if (user && user.phone && user.sms_notifications_enabled) {
        recipientMap.set(user.id, {
          userId: user.id,
          phoneNumber: user.phone,
          fullName: user.full_name,
        });
      }
    } else if (assignment.targetType === 'group' && assignment.targetGroupId) {
      // Group assignment - get all members of the group
      const { data: memberships } = await supabase
        .from('employee_group_memberships')
        .select(`
          user_id,
          user:users!inner(id, full_name, phone, sms_notifications_enabled)
        `)
        .eq('group_id', assignment.targetGroupId);

      if (memberships) {
        for (const membership of memberships) {
          const user = membership.user as unknown as {
            id: string;
            full_name: string;
            phone: string | null;
            sms_notifications_enabled: boolean;
          };

          if (user && user.phone && user.sms_notifications_enabled) {
            recipientMap.set(user.id, {
              userId: user.id,
              phoneNumber: user.phone,
              fullName: user.full_name,
            });
          }
        }
      }
    } else if (assignment.targetType === 'all') {
      // All employees
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, phone, sms_notifications_enabled')
        .eq('sms_notifications_enabled', true)
        .not('phone', 'is', null);

      if (users) {
        for (const user of users) {
          if (user.phone) {
            recipientMap.set(user.id, {
              userId: user.id,
              phoneNumber: user.phone,
              fullName: user.full_name,
            });
          }
        }
      }
    } else if (assignment.targetType === 'all_admins') {
      // All admin users
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, phone, sms_notifications_enabled')
        .eq('role', 'admin')
        .eq('sms_notifications_enabled', true)
        .not('phone', 'is', null);

      if (users) {
        for (const user of users) {
          if (user.phone) {
            recipientMap.set(user.id, {
              userId: user.id,
              phoneNumber: user.phone,
              fullName: user.full_name,
            });
          }
        }
      }
    }
  }

  return Array.from(recipientMap.values());
}

export async function sendTaskAssignedNotification(task: TaskInfo): Promise<void> {
  // Only send SMS for high or urgent priority tasks
  if (task.priority !== 'high' && task.priority !== 'urgent') {
    return;
  }

  const recipients = await getTaskAssigneePhones(task.assignments);

  if (recipients.length === 0) {
    return;
  }

  const priorityLabel = task.priority.toUpperCase();
  let message = `[${priorityLabel}] New task assigned: ${task.title}`;

  if (task.dueDate) {
    const dueDate = new Date(task.dueDate);
    const formattedDate = dueDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    if (task.dueTime) {
      message += ` - Due: ${formattedDate} at ${formatTime12h(task.dueTime)}`;
    } else {
      message += ` - Due: ${formattedDate}`;
    }
  }

  await sendBulkSms(
    recipients.map(r => ({ phoneNumber: r.phoneNumber, userId: r.userId })),
    message,
    'task_assigned'
  );
}

export async function sendTaskDueReminderNotification(task: TaskInfo): Promise<void> {
  const recipients = await getTaskAssigneePhones(task.assignments);

  if (recipients.length === 0) {
    return;
  }

  const priorityLabel = task.priority.toUpperCase();
  let message = `[REMINDER] ${priorityLabel} priority task due soon: ${task.title}`;

  if (task.dueTime) {
    message += ` - Due at ${formatTime12h(task.dueTime)}`;
  }

  await sendBulkSms(
    recipients.map(r => ({ phoneNumber: r.phoneNumber, userId: r.userId })),
    message,
    'task_due_reminder'
  );
}


export async function getUpcomingHighPriorityTasks(minutesBefore: number = 15): Promise<TaskInfo[]> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const now = new Date();
  const targetTime = new Date(now.getTime() + minutesBefore * 60 * 1000);

  // Get today's date in YYYY-MM-DD format
  const today = now.toISOString().split('T')[0];

  // Calculate time window (2 minutes before and after the target)
  const windowStart = new Date(targetTime.getTime() - 2 * 60 * 1000).toTimeString().slice(0, 8);
  const windowEnd = new Date(targetTime.getTime() + 2 * 60 * 1000).toTimeString().slice(0, 8);

  // Get high/urgent tasks due today within the time window that are not completed
  const { data: tasks, error } = await supabase
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

  if (error) {
    console.error('Error fetching upcoming tasks:', error);
    return [];
  }

  if (!tasks || tasks.length === 0) {
    return [];
  }

  // Check which tasks haven't had a reminder sent recently (within last 30 mins)
  const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

  const taskIds = tasks.map(t => t.id);
  const { data: recentNotifications } = await supabase
    .from('sms_notifications')
    .select('message')
    .eq('notification_type', 'task_due_reminder')
    .gte('created_at', thirtyMinsAgo)
    .in('message', taskIds.map(id => `%${id}%`));

  // Filter out tasks that already had reminders
  const notifiedTaskIds = new Set(
    recentNotifications?.map(n => {
      // Extract task ID from message if possible
      const match = n.message.match(/task-([a-f0-9-]+)/);
      return match ? match[1] : null;
    }).filter(Boolean) || []
  );

  return tasks
    .filter(t => !notifiedTaskIds.has(t.id))
    .map(t => ({
      id: t.id,
      title: t.title,
      priority: t.priority as 'low' | 'medium' | 'high' | 'urgent',
      dueDate: t.due_date,
      dueTime: t.due_time,
      assignments: (t.task_assignments || []).map((a: {
        target_type: string;
        target_user_id: string | null;
        target_group_id: string | null;
      }) => ({
        targetType: a.target_type as 'user' | 'group' | 'all' | 'all_admins',
        targetUserId: a.target_user_id || undefined,
        targetGroupId: a.target_group_id || undefined,
      })),
    }));
}
