import { NextRequest, NextResponse } from 'next/server';
import { createTaskSchema, type CreateTaskInput } from '@/lib/validators/task';
import { translateTaskContent, type SupportedLocale } from '@/lib/translation/gemini';
import { sendTaskAssignedPush } from '@/lib/notifications/push-service';
import { getApiAdminClient, requireApiAdminRole, handleApiError } from '@/lib/supabase/api-helpers';
import { generateTaskDates, type RepeatInterval } from '@/lib/task-generator';

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

    const { assignments, viewers, videos, repeatDays, repeatInterval, repeatEndDate, ...taskData } = result.data;
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

    // Determine dates for task creation
    let taskDates: (string | null)[] = [];

    if (repeatDays && repeatDays.length > 0 && repeatInterval && repeatEndDate && taskData.dueDate) {
      // Generate multiple dates using the repeat system
      taskDates = generateTaskDates({
        selectedDays: repeatDays,
        repeatInterval: repeatInterval as RepeatInterval,
        startDate: taskData.dueDate,
        endDate: repeatEndDate,
      });

      if (taskDates.length === 0) {
        return NextResponse.json(
          { error: 'No task dates generated - please check your repeat settings' },
          { status: 400 }
        );
      }
    } else {
      // Single task - use the due date (null is valid for tasks without a due date)
      taskDates = [taskData.dueDate || null];
    }

    // Create tasks for each date
    // Use a single timestamp for all tasks in this batch to ensure they're grouped together
    const batchCreatedAt = new Date().toISOString();

    const taskInserts = taskDates.map((date) => ({
      title: taskData.title,
      title_es: titleEs,
      title_zh: titleZh,
      description: taskData.description || null,
      description_es: descriptionEs,
      description_zh: descriptionZh,
      source_locale: sourceLocale,
      category_id: taskData.categoryId || null,
      priority: taskData.priority,
      due_date: date || null,
      due_time: taskData.dueTime || null,
      is_all_day: taskData.isAllDay,
      is_activity: taskData.isActivity || false,
      start_time: taskData.startTime || null,
      end_time: taskData.endTime || null,
      sync_to_calendar: taskData.syncToCalendar,
      created_by: user.id,
      created_at: batchCreatedAt,
    }));

    const { data: tasks, error: taskError } = await supabaseAdmin
      .from('tasks')
      .insert(taskInserts)
      .select();

    if (taskError || !tasks || tasks.length === 0) {
      console.error('Task creation error:', taskError);
      return NextResponse.json(
        { error: 'Failed to create task(s)' },
        { status: 500 }
      );
    }

    // For the rest of the logic, use the first task (or all tasks for assignments)
    const task = tasks[0];
    const taskIds = tasks.map(t => t.id);

    // Create assignments only if there are any - for ALL created tasks
    if (assignments && assignments.length > 0) {
      const assignmentsData: Array<{
        task_id: string;
        target_type: string;
        target_user_id: string | null;
        target_group_id: string | null;
      }> = [];

      for (const taskId of taskIds) {
        for (const a of assignments) {
          assignmentsData.push({
            task_id: taskId,
            target_type: a.targetType,
            target_user_id: a.targetType === 'user' ? (a.targetUserId ?? null) : null,
            target_group_id: a.targetType === 'group' ? (a.targetGroupId ?? null) : null,
          });
        }
      }

      const { error: assignmentError } = await supabaseAdmin
        .from('task_assignments')
        .insert(assignmentsData);

      if (assignmentError) {
        console.error('Assignment creation error:', assignmentError);
        await supabaseAdmin.from('tasks').delete().in('id', taskIds);
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

      // Send push notification for high/urgent priority tasks only
      const isHighPriority = taskData.priority === 'high' || taskData.priority === 'urgent';

      if (assignedUserIds.length > 0 && isHighPriority) {
        try {
          await sendTaskAssignedPush(
            [...new Set(assignedUserIds)], // Deduplicate
            taskData.title,
            task.id,
            taskData.priority!,
            taskData.description,
            taskData.dueDate,
            taskData.dueTime
          );
        } catch (err) {
          console.error('Failed to send task assignment push:', err);
        }
      }

    }

    // Create viewers only if there are any - for ALL created tasks
    if (viewers && viewers.length > 0) {
      const viewersData: Array<{
        task_id: string;
        target_type: string;
        target_user_id: string | null;
        target_group_id: string | null;
      }> = [];

      for (const taskId of taskIds) {
        for (const v of viewers) {
          viewersData.push({
            task_id: taskId,
            target_type: v.targetType,
            target_user_id: v.targetType === 'user' ? (v.targetUserId ?? null) : null,
            target_group_id: v.targetType === 'group' ? (v.targetGroupId ?? null) : null,
          });
        }
      }

      const { error: viewerError } = await supabaseAdmin
        .from('task_viewers')
        .insert(viewersData);

      if (viewerError) {
        console.error('Viewer creation error:', viewerError);
      }
    }

    // Create videos if any - for ALL created tasks
    if (videos && videos.length > 0) {
      const videosData: Array<{
        task_id: string;
        video_type: string;
        url: string;
        title: string | null;
        file_name: string | null;
        file_size: number | null;
        mime_type: string | null;
        created_by: string;
      }> = [];

      for (const taskId of taskIds) {
        for (const v of videos) {
          videosData.push({
            task_id: taskId,
            video_type: v.videoType,
            url: v.url,
            title: v.title || null,
            file_name: v.fileName || null,
            file_size: v.fileSize || null,
            mime_type: v.mimeType || null,
            created_by: user.id,
          });
        }
      }

      const { error: videoError } = await supabaseAdmin
        .from('task_videos')
        .insert(videosData);

      if (videoError) {
        console.error('Video creation error:', videoError);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: task.id,
        tasksCreated: tasks.length,
      },
    });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
