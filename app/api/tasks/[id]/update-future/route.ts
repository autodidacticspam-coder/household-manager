import { NextRequest, NextResponse } from 'next/server';
import { updateTaskSchema, type UpdateTaskInput } from '@/lib/validators/task';
import { translateTaskContent, type SupportedLocale } from '@/lib/translation/gemini';
import { getApiAdminClient, requireApiAdminRole, handleApiError } from '@/lib/supabase/api-helpers';
import { generateTaskDates, type RepeatInterval } from '@/lib/task-generator';
import { syncEventToConnectedUsers } from '@/lib/google-calendar/sync-service';

// PUT handler for updating a task and all future instances in the same batch
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;
    const input: UpdateTaskInput = await request.json();

    // Validate input
    const result = updateTaskSchema.safeParse(input);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0].message },
        { status: 400 }
      );
    }

    const repeatFieldsProvided =
      Object.prototype.hasOwnProperty.call(result.data, 'repeatDays')
      || Object.prototype.hasOwnProperty.call(result.data, 'repeatInterval')
      || Object.prototype.hasOwnProperty.call(result.data, 'repeatEndDate');

    const { user, userData } = await requireApiAdminRole();
    const supabaseAdmin = getApiAdminClient();

    // First, get the task to find its batch info (title + created_by + created_at date)
    const { data: task, error: fetchError } = await supabaseAdmin
      .from('tasks')
      .select('id, title, description, due_date, created_at, created_by')
      .eq('id', taskId)
      .single();

    if (fetchError || !task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    const createdDate = task.created_at?.slice(0, 10) || '';

    const { data: batchTasks, error: batchError } = await supabaseAdmin
      .from('tasks')
      .select('id, due_date, created_at')
      .eq('title', task.title)
      .eq('created_by', task.created_by);

    if (batchError) {
      console.error('Error fetching batch tasks:', batchError);
      return NextResponse.json(
        { error: 'Failed to fetch related tasks' },
        { status: 500 }
      );
    }

    // Filter to only tasks in the same batch (matching created_at date)
    const allBatchTasks = (batchTasks || []).filter((batchTask) => {
      const taskCreatedDate = batchTask.created_at?.slice(0, 10) || '';
      return taskCreatedDate === createdDate;
    });

    const tasksFromCurrent = allBatchTasks.filter((batchTask) => {
      if (!task.due_date) {
        return batchTask.id === taskId;
      }

      return !!batchTask.due_date && batchTask.due_date >= task.due_date;
    });

    if (tasksFromCurrent.length === 0) {
      return NextResponse.json(
        { error: 'No tasks found to update' },
        { status: 404 }
      );
    }

    const { assignments, viewers, videos, repeatDays, repeatInterval, repeatEndDate, ...taskData } = result.data;
    const sourceLocale = (userData?.preferred_locale || 'en') as SupportedLocale;
    const normalizedRepeatDays = [...new Set((repeatDays || []).sort((a, b) => a - b))];
    const shouldKeepRecurringSchedule = normalizedRepeatDays.length > 0 && !!repeatInterval && !!repeatEndDate;

    if (repeatFieldsProvided && shouldKeepRecurringSchedule && !task.due_date) {
      return NextResponse.json(
        { error: 'A due date is required to update the recurring schedule' },
        { status: 400 }
      );
    }

    // Build update data (excluding due_date to preserve the current task date)
    const updateData: Record<string, unknown> = {};

    // If title or description changed, translate them
    if (taskData.title !== undefined || taskData.description !== undefined) {
      const newTitle = taskData.title ?? task.title ?? '';
      const newDescription = taskData.description ?? task.description ?? null;

      try {
        const translations = await translateTaskContent(newTitle, newDescription, sourceLocale);
        if (taskData.title !== undefined) {
          updateData.title = taskData.title;
          updateData.title_es = translations.title.es;
          updateData.title_zh = translations.title.zh;
          updateData.source_locale = sourceLocale;
        }
        if (taskData.description !== undefined) {
          updateData.description = taskData.description;
          updateData.description_es = translations.description.es || null;
          updateData.description_zh = translations.description.zh || null;
        }
      } catch (err) {
        console.error('Translation failed during batch update:', err);
        if (taskData.title !== undefined) updateData.title = taskData.title;
        if (taskData.description !== undefined) updateData.description = taskData.description;
      }
    }

    if (taskData.categoryId !== undefined) updateData.category_id = taskData.categoryId;
    if (taskData.priority !== undefined) updateData.priority = taskData.priority;
    if (taskData.dueTime !== undefined) updateData.due_time = taskData.dueTime;
    if (taskData.isAllDay !== undefined) updateData.is_all_day = taskData.isAllDay;
    if (taskData.isActivity !== undefined) updateData.is_activity = taskData.isActivity;
    if (taskData.startTime !== undefined) updateData.start_time = taskData.startTime;
    if (taskData.endTime !== undefined) updateData.end_time = taskData.endTime;
    if (taskData.syncToCalendar !== undefined) updateData.sync_to_calendar = taskData.syncToCalendar;

    let keptTaskIds = tasksFromCurrent.map((batchTask) => batchTask.id);
    let createdTaskIds: string[] = [];
    let deletedTaskIds: string[] = [];

    if (repeatFieldsProvided) {
      const existingFutureTasks = tasksFromCurrent.filter((batchTask) => batchTask.id !== taskId);
      const desiredFutureDates = shouldKeepRecurringSchedule && task.due_date
        ? generateTaskDates({
            selectedDays: normalizedRepeatDays,
            repeatInterval: repeatInterval as RepeatInterval,
            startDate: task.due_date,
            endDate: repeatEndDate as string,
          }).filter((date) => date > task.due_date)
        : [];

      const keepTasks = existingFutureTasks.filter((batchTask) =>
        !!batchTask.due_date && desiredFutureDates.includes(batchTask.due_date)
      );
      const keepDates = new Set(keepTasks.map((batchTask) => batchTask.due_date));
      const createDates = desiredFutureDates.filter((date) => !keepDates.has(date));
      const deleteTasks = existingFutureTasks.filter((batchTask) => !keepTasks.some((keepTask) => keepTask.id === batchTask.id));

      keptTaskIds = [taskId, ...keepTasks.map((batchTask) => batchTask.id)];
      deletedTaskIds = deleteTasks.map((batchTask) => batchTask.id);

      if (Object.keys(updateData).length > 0 && keptTaskIds.length > 0) {
        const { error: updateError } = await supabaseAdmin
          .from('tasks')
          .update(updateData)
          .in('id', keptTaskIds);

        if (updateError) {
          console.error('Batch task update error:', updateError);
          return NextResponse.json(
            { error: 'Failed to update tasks' },
            { status: 500 }
          );
        }
      }

      const { data: baseTask, error: baseTaskError } = await supabaseAdmin
        .from('tasks')
        .select(`
          id,
          title,
          title_es,
          title_zh,
          description,
          description_es,
          description_zh,
          source_locale,
          category_id,
          priority,
          due_time,
          is_all_day,
          is_activity,
          start_time,
          end_time,
          sync_to_calendar,
          created_by,
          created_at
        `)
        .eq('id', taskId)
        .single();

      if (baseTaskError || !baseTask) {
        return NextResponse.json(
          { error: 'Failed to load updated task' },
          { status: 500 }
        );
      }

      if (createDates.length > 0) {
        const taskInserts = createDates.map((date) => ({
          title: baseTask.title,
          title_es: baseTask.title_es,
          title_zh: baseTask.title_zh,
          description: baseTask.description || null,
          description_es: baseTask.description_es || null,
          description_zh: baseTask.description_zh || null,
          source_locale: baseTask.source_locale || sourceLocale,
          category_id: baseTask.category_id || null,
          priority: baseTask.priority,
          due_date: date,
          due_time: baseTask.due_time || null,
          is_all_day: baseTask.is_all_day,
          is_activity: baseTask.is_activity || false,
          start_time: baseTask.start_time || null,
          end_time: baseTask.end_time || null,
          sync_to_calendar: baseTask.sync_to_calendar,
          created_by: baseTask.created_by,
          created_at: baseTask.created_at,
        }));

        const { data: createdTasks, error: createError } = await supabaseAdmin
          .from('tasks')
          .insert(taskInserts)
          .select('id');

        if (createError) {
          console.error('Batch task creation error:', createError);
          return NextResponse.json(
            { error: 'Failed to create updated recurring tasks' },
            { status: 500 }
          );
        }

        createdTaskIds = (createdTasks || []).map((createdTask) => createdTask.id);
      }

      if (deletedTaskIds.length > 0) {
        for (const deletedTaskId of deletedTaskIds) {
          syncEventToConnectedUsers('task', deletedTaskId, 'delete').catch(err =>
            console.error('Calendar sync delete failed:', err)
          );
        }

        const { error: deleteError } = await supabaseAdmin
          .from('tasks')
          .delete()
          .in('id', deletedTaskIds);

        if (deleteError) {
          console.error('Batch task deletion error:', deleteError);
          return NextResponse.json(
            { error: 'Failed to delete outdated recurring tasks' },
            { status: 500 }
          );
        }
      }
    } else if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('tasks')
        .update(updateData)
        .in('id', keptTaskIds);

      if (updateError) {
        console.error('Batch task update error:', updateError);
        return NextResponse.json(
          { error: 'Failed to update tasks' },
          { status: 500 }
        );
      }
    }

    const managedTaskIds = [...new Set([...keptTaskIds, ...createdTaskIds])];

    // Update assignments for all managed tasks if provided
    if (assignments !== undefined && managedTaskIds.length > 0) {
      await supabaseAdmin
        .from('task_assignments')
        .delete()
        .in('task_id', managedTaskIds);

      if (assignments.length > 0) {
        const allAssignments = managedTaskIds.flatMap((managedTaskId) =>
          assignments.map((assignment) => ({
            task_id: managedTaskId,
            target_type: assignment.targetType,
            target_user_id: assignment.targetType === 'user' ? assignment.targetUserId : null,
            target_group_id: assignment.targetType === 'group' ? assignment.targetGroupId : null,
          }))
        );

        const { error: assignmentError } = await supabaseAdmin
          .from('task_assignments')
          .insert(allAssignments);

        if (assignmentError) {
          console.error('Batch assignment update error:', assignmentError);
        }
      }
    }

    // Update viewers for all managed tasks if provided
    if (viewers !== undefined && managedTaskIds.length > 0) {
      await supabaseAdmin
        .from('task_viewers')
        .delete()
        .in('task_id', managedTaskIds);

      if (viewers.length > 0) {
        const allViewers = managedTaskIds.flatMap((managedTaskId) =>
          viewers.map((viewer) => ({
            task_id: managedTaskId,
            target_type: viewer.targetType,
            target_user_id: viewer.targetType === 'user' ? viewer.targetUserId : null,
            target_group_id: viewer.targetType === 'group' ? viewer.targetGroupId : null,
          }))
        );

        const { error: viewerError } = await supabaseAdmin
          .from('task_viewers')
          .insert(allViewers);

        if (viewerError) {
          console.error('Batch viewer update error:', viewerError);
        }
      }
    }

    // Update videos for all managed tasks if provided
    if (videos !== undefined && managedTaskIds.length > 0) {
      await supabaseAdmin
        .from('task_videos')
        .delete()
        .in('task_id', managedTaskIds);

      if (videos.length > 0) {
        const allVideos = managedTaskIds.flatMap((managedTaskId) =>
          videos.map((video) => ({
            task_id: managedTaskId,
            video_type: video.videoType,
            url: video.url,
            title: video.title || null,
            file_name: video.fileName || null,
            file_size: video.fileSize || null,
            mime_type: video.mimeType || null,
            created_by: user.id,
          }))
        );

        const { error: videoError } = await supabaseAdmin
          .from('task_videos')
          .insert(allVideos);

        if (videoError) {
          console.error('Batch video update error:', videoError);
        }
      }
    }

    if (managedTaskIds.length > 0) {
      const { data: managedTasks } = await supabaseAdmin
        .from('tasks')
        .select('id, title, description, due_date, due_time, is_all_day, is_activity, start_time, end_time, status, priority')
        .in('id', managedTaskIds);
      const createdTaskIdSet = new Set(createdTaskIds);

      for (const managedTask of managedTasks || []) {
        syncEventToConnectedUsers('task', managedTask.id, createdTaskIdSet.has(managedTask.id) ? 'create' : 'update', {
          id: managedTask.id,
          title: managedTask.title,
          description: managedTask.description,
          dueDate: managedTask.due_date,
          dueTime: managedTask.due_time,
          isAllDay: managedTask.is_all_day,
          isActivity: managedTask.is_activity,
          startTime: managedTask.start_time,
          endTime: managedTask.end_time,
          status: managedTask.status,
          priority: managedTask.priority,
        }).catch(err => console.error('Calendar sync update failed:', err));
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount: managedTaskIds.length,
      createdCount: createdTaskIds.length,
      deletedCount: deletedTaskIds.length,
    });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
