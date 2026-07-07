import { NextRequest, NextResponse, after } from 'next/server';
import { updateTaskSchema, type UpdateTaskInput } from '@/lib/validators/task';
import { translateTaskContent, type SupportedLocale } from '@/lib/translation/gemini';
import { getApiAdminClient, requireApiAdminRole, handleApiError } from '@/lib/supabase/api-helpers';
import { syncEventToConnectedUsers } from '@/lib/google-calendar/sync-service';
import { generateTaskDates, type RepeatInterval } from '@/lib/task-generator';

// DELETE handler for deleting a task
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: taskId } = await params;

    await requireApiAdminRole();
    const supabaseAdmin = getApiAdminClient();

    const { error } = await supabaseAdmin
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (error) {
      console.error('Task deletion error:', error);
      return NextResponse.json(
        { error: 'Failed to delete task' },
        { status: 500 }
      );
    }

    // Only remove the Google event once the DB delete is confirmed (the
    // mapping row survives the task row's deletion, so ordering is safe)
    after(syncEventToConnectedUsers('task', taskId, 'delete').catch(err =>
      console.error('Calendar sync delete failed:', err)
    ));

    return NextResponse.json({ success: true });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}

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

    const { data: currentTask, error: currentTaskError } = await supabaseAdmin
      .from('tasks')
      .select(`
        id,
        title,
        description,
        due_date,
        due_time,
        is_all_day,
        is_activity,
        start_time,
        end_time,
        status,
        priority,
        category_id,
        sync_to_calendar,
        created_by,
        created_at
      `)
      .eq('id', taskId)
      .single();

    if (currentTaskError || !currentTask) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    const { assignments, viewers, videos, repeatDays, repeatInterval, repeatEndDate, ...taskData } = result.data;
    const sourceLocale = (userData?.preferred_locale || 'en') as SupportedLocale;
    const normalizedRepeatDays = [...new Set((repeatDays || []).sort((a, b) => a - b))];
    const shouldCreateRecurringTasks = normalizedRepeatDays.length > 0 && !!repeatInterval && !!repeatEndDate;
    const nextDueDate = taskData.dueDate ?? currentTask.due_date;

    if (shouldCreateRecurringTasks && !nextDueDate) {
      return NextResponse.json(
        { error: 'A due date is required to create recurring tasks' },
        { status: 400 }
      );
    }

    // Update task
    const updateData: Record<string, unknown> = {};

    // If title or description changed, re-translate
    if (taskData.title !== undefined || taskData.description !== undefined) {
      const newTitle = taskData.title ?? currentTask.title ?? '';
      const newDescription = taskData.description ?? currentTask.description ?? null;

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
        console.error('Translation failed during update:', err);
        if (taskData.title !== undefined) updateData.title = taskData.title;
        if (taskData.description !== undefined) updateData.description = taskData.description;
      }
    }

    if (taskData.categoryId !== undefined) updateData.category_id = taskData.categoryId;
    if (taskData.priority !== undefined) updateData.priority = taskData.priority;
    if (taskData.status !== undefined) updateData.status = taskData.status;
    if (taskData.dueDate !== undefined) updateData.due_date = taskData.dueDate;
    if (taskData.dueTime !== undefined) updateData.due_time = taskData.dueTime;
    if (taskData.isAllDay !== undefined) updateData.is_all_day = taskData.isAllDay;
    if (taskData.isActivity !== undefined) updateData.is_activity = taskData.isActivity;
    if (taskData.startTime !== undefined) updateData.start_time = taskData.startTime;
    if (taskData.endTime !== undefined) updateData.end_time = taskData.endTime;
    if (taskData.syncToCalendar !== undefined) updateData.sync_to_calendar = taskData.syncToCalendar;

    if (Object.keys(updateData).length > 0) {
      const { error: taskError } = await supabaseAdmin
        .from('tasks')
        .update(updateData)
        .eq('id', taskId);

      if (taskError) {
        console.error('Task update error:', taskError);
        return NextResponse.json(
          { error: 'Failed to update task' },
          { status: 500 }
        );
      }
    }

    // Update assignments if provided
    if (assignments !== undefined) {
      await supabaseAdmin
        .from('task_assignments')
        .delete()
        .eq('task_id', taskId);

      if (assignments.length > 0) {
        const assignmentsData = assignments.map((a) => ({
          task_id: taskId,
          target_type: a.targetType,
          target_user_id: a.targetType === 'user' ? a.targetUserId : null,
          target_group_id: a.targetType === 'group' ? a.targetGroupId : null,
        }));

        const { error: assignmentError } = await supabaseAdmin
          .from('task_assignments')
          .insert(assignmentsData);

        if (assignmentError) {
          console.error('Assignment update error:', assignmentError);
          return NextResponse.json(
            { error: 'Failed to update task assignments' },
            { status: 500 }
          );
        }
      }
    }

    // Update viewers if provided
    if (viewers !== undefined) {
      await supabaseAdmin
        .from('task_viewers')
        .delete()
        .eq('task_id', taskId);

      if (viewers.length > 0) {
        const viewersData = viewers.map((v) => ({
          task_id: taskId,
          target_type: v.targetType,
          target_user_id: v.targetType === 'user' ? v.targetUserId : null,
          target_group_id: v.targetType === 'group' ? v.targetGroupId : null,
        }));

        const { error: viewerError } = await supabaseAdmin
          .from('task_viewers')
          .insert(viewersData);

        if (viewerError) {
          console.error('Viewer update error:', viewerError);
        }
      }
    }

    // Update videos if provided
    if (videos !== undefined) {
      await supabaseAdmin
        .from('task_videos')
        .delete()
        .eq('task_id', taskId);

      if (videos.length > 0) {
        const videosData = videos.map((v) => ({
          task_id: taskId,
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
          console.error('Video update error:', videoError);
        }
      }
    }

    // Sync updated task to Google Calendar
    const { data: updatedTask } = await supabaseAdmin
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
        due_date,
        due_time,
        is_all_day,
        is_activity,
        start_time,
        end_time,
        status,
        priority,
        category_id,
        sync_to_calendar,
        created_by,
        created_at
      `)
      .eq('id', taskId)
      .single();

    if (!updatedTask) {
      return NextResponse.json(
        { error: 'Task not found after update' },
        { status: 404 }
      );
    }

    after(syncEventToConnectedUsers('task', taskId, 'update', {
      id: updatedTask.id,
      title: updatedTask.title,
      description: updatedTask.description,
      dueDate: updatedTask.due_date,
      dueTime: updatedTask.due_time,
      isAllDay: updatedTask.is_all_day,
      isActivity: updatedTask.is_activity,
      startTime: updatedTask.start_time,
      endTime: updatedTask.end_time,
      status: updatedTask.status,
      priority: updatedTask.priority,
    }).catch(err => console.error('Calendar sync update failed:', err)));

    let createdCount = 0;

    if (repeatFieldsProvided) {
      if (shouldCreateRecurringTasks && updatedTask.due_date) {
        // Skip dates that already exist in this batch: without this, a
        // double-submit (or a batch member edited while batch-info errored)
        // inserted a full duplicate set of future tasks.
        const { data: existingSiblings } = await supabaseAdmin
          .from('tasks')
          .select('due_date')
          .eq('title', updatedTask.title)
          .eq('created_by', updatedTask.created_by)
          .eq('created_at', updatedTask.created_at);
        const existingDates = new Set((existingSiblings || []).map((s) => s.due_date));

        const futureDates = generateTaskDates({
          selectedDays: normalizedRepeatDays,
          repeatInterval: repeatInterval as RepeatInterval,
          startDate: updatedTask.due_date,
          endDate: repeatEndDate as string,
        }).filter((date) => date > updatedTask.due_date && !existingDates.has(date));

        if (futureDates.length > 0) {
          const taskInserts = futureDates.map((date) => ({
            title: updatedTask.title,
            title_es: updatedTask.title_es,
            title_zh: updatedTask.title_zh,
            description: updatedTask.description || null,
            description_es: updatedTask.description_es || null,
            description_zh: updatedTask.description_zh || null,
            source_locale: updatedTask.source_locale || sourceLocale,
            category_id: updatedTask.category_id || null,
            priority: updatedTask.priority,
            due_date: date,
            due_time: updatedTask.due_time || null,
            is_all_day: updatedTask.is_all_day,
            is_activity: updatedTask.is_activity || false,
            start_time: updatedTask.start_time || null,
            end_time: updatedTask.end_time || null,
            sync_to_calendar: updatedTask.sync_to_calendar,
            created_by: updatedTask.created_by,
            created_at: updatedTask.created_at,
          }));

          const { data: createdTasks, error: createTasksError } = await supabaseAdmin
            .from('tasks')
            .insert(taskInserts)
            .select('id, title, description, due_date, due_time, is_all_day, is_activity, start_time, end_time, status, priority');

          if (createTasksError) {
            console.error('Recurring task creation error:', createTasksError);
            return NextResponse.json(
              { error: 'Failed to create recurring tasks' },
              { status: 500 }
            );
          }

          const createdTaskIds = (createdTasks || []).map((task) => task.id);
          createdCount = createdTaskIds.length;

          if (assignments !== undefined && createdTaskIds.length > 0 && assignments.length > 0) {
            const assignmentRows = createdTaskIds.flatMap((createdTaskId) =>
              assignments.map((assignment) => ({
                task_id: createdTaskId,
                target_type: assignment.targetType,
                target_user_id: assignment.targetType === 'user' ? assignment.targetUserId : null,
                target_group_id: assignment.targetType === 'group' ? assignment.targetGroupId : null,
              }))
            );

            const { error: assignmentError } = await supabaseAdmin
              .from('task_assignments')
              .insert(assignmentRows);

            if (assignmentError) {
              console.error('Recurring assignment creation error:', assignmentError);
            }
          }

          if (viewers !== undefined && createdTaskIds.length > 0 && viewers.length > 0) {
            const viewerRows = createdTaskIds.flatMap((createdTaskId) =>
              viewers.map((viewer) => ({
                task_id: createdTaskId,
                target_type: viewer.targetType,
                target_user_id: viewer.targetType === 'user' ? viewer.targetUserId : null,
                target_group_id: viewer.targetType === 'group' ? viewer.targetGroupId : null,
              }))
            );

            const { error: viewerError } = await supabaseAdmin
              .from('task_viewers')
              .insert(viewerRows);

            if (viewerError) {
              console.error('Recurring viewer creation error:', viewerError);
            }
          }

          if (videos !== undefined && createdTaskIds.length > 0 && videos.length > 0) {
            const videoRows = createdTaskIds.flatMap((createdTaskId) =>
              videos.map((video) => ({
                task_id: createdTaskId,
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
              .insert(videoRows);

            if (videoError) {
              console.error('Recurring video creation error:', videoError);
            }
          }

          for (const createdTask of createdTasks || []) {
            after(syncEventToConnectedUsers('task', createdTask.id, 'create', {
              id: createdTask.id,
              title: createdTask.title,
              description: createdTask.description,
              dueDate: createdTask.due_date,
              dueTime: createdTask.due_time,
              isAllDay: createdTask.is_all_day,
              isActivity: createdTask.is_activity,
              startTime: createdTask.start_time,
              endTime: createdTask.end_time,
              status: createdTask.status,
              priority: createdTask.priority,
            }).catch(err => console.error('Calendar sync create failed:', err)));
          }
        }
      }
    }

    return NextResponse.json({ success: true, createdCount });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
