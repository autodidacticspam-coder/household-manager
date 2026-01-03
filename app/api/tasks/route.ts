import { NextRequest, NextResponse } from 'next/server';
import { createTaskSchema, type CreateTaskInput } from '@/lib/validators/task';
import { translateTaskContent, type SupportedLocale } from '@/lib/translation/gemini';
import { sendTaskAssignedNotification } from '@/lib/notifications/task-notifications';
import { sendTaskAssignedPush } from '@/lib/notifications/push-service';
import { getApiAdminClient, requireApiAdminRole, handleApiError } from '@/lib/supabase/api-helpers';

export async function POST(request: NextRequest) {
  try {
    const input: CreateTaskInput = await request.json();

    // Validate input
    const result = createTaskSchema.safeParse(input);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const { user, userData } = await requireApiAdminRole();
    const supabaseAdmin = getApiAdminClient();

    const { assignments, viewers, videos, ...taskData } = result.data;
    const sourceLocale = (userData?.preferred_locale || 'en') as SupportedLocale;

    // Translate task content to all languages
    let titleEs = null;
    let titleZh = null;
    let descriptionEs = null;
    let descriptionZh = null;

    try {
      const translations = await translateTaskContent(
        taskData.title,
        taskData.description || null,
        sourceLocale
      );
      titleEs = translations.title.es;
      titleZh = translations.title.zh;
      descriptionEs = translations.description.es || null;
      descriptionZh = translations.description.zh || null;
    } catch (err) {
      console.error('Translation failed, continuing without translations:', err);
    }

    // Create task
    const { data: task, error: taskError } = await supabaseAdmin
      .from('tasks')
      .insert({
        title: taskData.title,
        title_es: titleEs,
        title_zh: titleZh,
        description: taskData.description || null,
        description_es: descriptionEs,
        description_zh: descriptionZh,
        source_locale: sourceLocale,
        category_id: taskData.categoryId || null,
        priority: taskData.priority,
        due_date: taskData.dueDate || null,
        due_time: taskData.dueTime || null,
        is_all_day: taskData.isAllDay,
        is_activity: taskData.isActivity || false,
        start_time: taskData.startTime || null,
        end_time: taskData.endTime || null,
        is_recurring: taskData.isRecurring,
        recurrence_rule: taskData.recurrenceRule || null,
        sync_to_calendar: taskData.syncToCalendar,
        created_by: user.id,
      })
      .select()
      .single();

    if (taskError) {
      console.error('Task creation error:', taskError);
      return NextResponse.json(
        { error: 'Failed to create task' },
        { status: 500 }
      );
    }

    // Create assignments only if there are any
    if (assignments && assignments.length > 0) {
      const assignmentsData = assignments.map((a) => ({
        task_id: task.id,
        target_type: a.targetType,
        target_user_id: a.targetType === 'user' ? a.targetUserId : null,
        target_group_id: a.targetType === 'group' ? a.targetGroupId : null,
      }));

      const { error: assignmentError } = await supabaseAdmin
        .from('task_assignments')
        .insert(assignmentsData);

      if (assignmentError) {
        console.error('Assignment creation error:', assignmentError);
        await supabaseAdmin.from('tasks').delete().eq('id', task.id);
        return NextResponse.json(
          { error: 'Failed to create task assignments' },
          { status: 500 }
        );
      }

      // Get user IDs for push notifications
      const assignedUserIds: string[] = [];
      for (const a of assignments) {
        if (a.targetType === 'user' && a.targetUserId) {
          assignedUserIds.push(a.targetUserId);
        } else if (a.targetType === 'group' && a.targetGroupId) {
          // Get group members
          const { data: members } = await supabaseAdmin
            .from('employee_group_memberships')
            .select('user_id')
            .eq('group_id', a.targetGroupId);
          if (members) {
            assignedUserIds.push(...members.map(m => m.user_id));
          }
        } else if (a.targetType === 'all') {
          // Get all employees
          const { data: users } = await supabaseAdmin
            .from('users')
            .select('id')
            .neq('role', 'admin');
          if (users) {
            assignedUserIds.push(...users.map(u => u.id));
          }
        } else if (a.targetType === 'all_admins') {
          // Get all admins
          const { data: users } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('role', 'admin');
          if (users) {
            assignedUserIds.push(...users.map(u => u.id));
          }
        }
      }

      // Send push notification for all task assignments (non-blocking)
      if (assignedUserIds.length > 0) {
        sendTaskAssignedPush(
          [...new Set(assignedUserIds)], // Deduplicate
          taskData.title,
          task.id,
          taskData.priority
        ).catch(err => {
          console.error('Failed to send task assignment push:', err);
        });
      }

      // Send SMS notification for high/urgent priority tasks (non-blocking)
      if (taskData.priority === 'high' || taskData.priority === 'urgent') {
        sendTaskAssignedNotification({
          id: task.id,
          title: taskData.title,
          priority: taskData.priority,
          dueDate: taskData.dueDate || undefined,
          dueTime: taskData.dueTime || undefined,
          assignments: assignments.map(a => ({
            targetType: a.targetType,
            targetUserId: a.targetUserId,
            targetGroupId: a.targetGroupId,
          })),
        }).catch(err => {
          console.error('Failed to send task assignment SMS:', err);
        });
      }
    }

    // Create viewers only if there are any
    if (viewers && viewers.length > 0) {
      const viewersData = viewers.map((v) => ({
        task_id: task.id,
        target_type: v.targetType,
        target_user_id: v.targetType === 'user' ? v.targetUserId : null,
        target_group_id: v.targetType === 'group' ? v.targetGroupId : null,
      }));

      const { error: viewerError } = await supabaseAdmin
        .from('task_viewers')
        .insert(viewersData);

      if (viewerError) {
        console.error('Viewer creation error:', viewerError);
      }
    }

    // Create videos if any
    if (videos && videos.length > 0) {
      const videosData = videos.map((v) => ({
        task_id: task.id,
        video_type: v.videoType,
        url: v.url,
        title: v.title || null,
        file_name: v.fileName || null,
        file_size: v.fileSize || null,
        mime_type: v.mimeType || null,
        created_by: user.id,
      }));

      const { error: videoError } = await supabaseAdmin
        .from('task_videos')
        .insert(videosData);

      if (videoError) {
        console.error('Video creation error:', videoError);
      }
    }

    return NextResponse.json({ success: true, data: { id: task.id } });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
