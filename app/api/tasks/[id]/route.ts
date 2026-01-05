import { NextRequest, NextResponse } from 'next/server';
import { updateTaskSchema, type UpdateTaskInput } from '@/lib/validators/task';
import { translateTaskContent, type SupportedLocale } from '@/lib/translation/gemini';
import { getApiAdminClient, requireApiAdminRole, handleApiError } from '@/lib/supabase/api-helpers';

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

    const { user, userData } = await requireApiAdminRole();
    const supabaseAdmin = getApiAdminClient();

    const { assignments, viewers, videos, ...taskData } = result.data;
    const sourceLocale = (userData?.preferred_locale || 'en') as SupportedLocale;

    // Update task
    const updateData: Record<string, unknown> = {};

    // If title or description changed, re-translate
    if (taskData.title !== undefined || taskData.description !== undefined) {
      const { data: currentTask } = await supabaseAdmin
        .from('tasks')
        .select('title, description')
        .eq('id', taskId)
        .single();

      const newTitle = taskData.title ?? currentTask?.title ?? '';
      const newDescription = taskData.description ?? currentTask?.description ?? null;

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
    if (assignments && assignments.length > 0) {
      await supabaseAdmin
        .from('task_assignments')
        .delete()
        .eq('task_id', taskId);

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

    return NextResponse.json({ success: true });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
