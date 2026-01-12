import { NextRequest, NextResponse } from 'next/server';
import { updateTaskSchema, type UpdateTaskInput } from '@/lib/validators/task';
import { translateTaskContent, type SupportedLocale } from '@/lib/translation/gemini';
import { getApiAdminClient, requireApiAdminRole, handleApiError } from '@/lib/supabase/api-helpers';

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

    const { user, userData } = await requireApiAdminRole();
    const supabaseAdmin = getApiAdminClient();

    // First, get the task to find its batch info (title + created_by + created_at date)
    const { data: task, error: fetchError } = await supabaseAdmin
      .from('tasks')
      .select('id, title, due_date, created_at, created_by')
      .eq('id', taskId)
      .single();

    if (fetchError || !task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }

    // Find all tasks in the same batch with due_date >= this task's due_date
    const createdDate = task.created_at?.slice(0, 10) || '';

    const { data: batchTasks, error: batchError } = await supabaseAdmin
      .from('tasks')
      .select('id, due_date, created_at')
      .eq('title', task.title)
      .eq('created_by', task.created_by)
      .gte('due_date', task.due_date || '1970-01-01');

    if (batchError) {
      console.error('Error fetching batch tasks:', batchError);
      return NextResponse.json(
        { error: 'Failed to fetch related tasks' },
        { status: 500 }
      );
    }

    // Filter to only tasks in the same batch (matching created_at date)
    const tasksToUpdate = (batchTasks || []).filter(t => {
      const tCreatedDate = t.created_at?.slice(0, 10) || '';
      return tCreatedDate === createdDate;
    });

    if (tasksToUpdate.length === 0) {
      return NextResponse.json(
        { error: 'No tasks found to update' },
        { status: 404 }
      );
    }

    const taskIdsToUpdate = tasksToUpdate.map(t => t.id);
    const { assignments, viewers, videos, ...taskData } = result.data;
    const sourceLocale = (userData?.preferred_locale || 'en') as SupportedLocale;

    // Build update data (excluding due_date to preserve the schedule)
    const updateData: Record<string, unknown> = {};

    // If title or description changed, translate them
    if (taskData.title !== undefined || taskData.description !== undefined) {
      const newTitle = taskData.title ?? task.title ?? '';
      const newDescription = taskData.description ?? null;

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

    // Apply simple field updates (but NOT due_date - that keeps the recurring schedule)
    if (taskData.categoryId !== undefined) updateData.category_id = taskData.categoryId;
    if (taskData.priority !== undefined) updateData.priority = taskData.priority;
    // Don't update status for future tasks - each task has its own status
    if (taskData.dueTime !== undefined) updateData.due_time = taskData.dueTime;
    if (taskData.isAllDay !== undefined) updateData.is_all_day = taskData.isAllDay;
    if (taskData.isActivity !== undefined) updateData.is_activity = taskData.isActivity;
    if (taskData.startTime !== undefined) updateData.start_time = taskData.startTime;
    if (taskData.endTime !== undefined) updateData.end_time = taskData.endTime;
    if (taskData.syncToCalendar !== undefined) updateData.sync_to_calendar = taskData.syncToCalendar;

    // Update all tasks in the batch
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('tasks')
        .update(updateData)
        .in('id', taskIdsToUpdate);

      if (updateError) {
        console.error('Batch task update error:', updateError);
        return NextResponse.json(
          { error: 'Failed to update tasks' },
          { status: 500 }
        );
      }
    }

    // Update assignments for all tasks if provided
    if (assignments && assignments.length > 0) {
      // Delete existing assignments for all tasks
      await supabaseAdmin
        .from('task_assignments')
        .delete()
        .in('task_id', taskIdsToUpdate);

      // Insert new assignments for each task
      const allAssignments = taskIdsToUpdate.flatMap(tid =>
        assignments.map(a => ({
          task_id: tid,
          target_type: a.targetType,
          target_user_id: a.targetType === 'user' ? a.targetUserId : null,
          target_group_id: a.targetType === 'group' ? a.targetGroupId : null,
        }))
      );

      const { error: assignmentError } = await supabaseAdmin
        .from('task_assignments')
        .insert(allAssignments);

      if (assignmentError) {
        console.error('Batch assignment update error:', assignmentError);
      }
    }

    // Update viewers for all tasks if provided
    if (viewers !== undefined) {
      // Delete existing viewers for all tasks
      await supabaseAdmin
        .from('task_viewers')
        .delete()
        .in('task_id', taskIdsToUpdate);

      if (viewers.length > 0) {
        const allViewers = taskIdsToUpdate.flatMap(tid =>
          viewers.map(v => ({
            task_id: tid,
            target_type: v.targetType,
            target_user_id: v.targetType === 'user' ? v.targetUserId : null,
            target_group_id: v.targetType === 'group' ? v.targetGroupId : null,
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

    // Update videos for all tasks if provided
    if (videos !== undefined) {
      // Delete existing videos for all tasks
      await supabaseAdmin
        .from('task_videos')
        .delete()
        .in('task_id', taskIdsToUpdate);

      if (videos.length > 0) {
        const allVideos = taskIdsToUpdate.flatMap(tid =>
          videos.map(v => ({
            task_id: tid,
            video_type: v.videoType,
            url: v.url,
            title: v.title || null,
            file_name: v.fileName || null,
            file_size: v.fileSize || null,
            mime_type: v.mimeType || null,
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

    return NextResponse.json({
      success: true,
      updatedCount: taskIdsToUpdate.length
    });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
