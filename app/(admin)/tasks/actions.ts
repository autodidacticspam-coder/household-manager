'use server';

import { createClient, getAdminClient, type ActionState } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { createTaskSchema, updateTaskSchema, type CreateTaskInput, type UpdateTaskInput } from '@/lib/validators/task';
import { translateTaskContent, type SupportedLocale } from '@/lib/translation/gemini';
import { sendTaskAssignedNotification } from '@/lib/notifications/task-notifications';

// Re-exported from lib/supabase/server
export type { ActionState };

export async function createTask(input: CreateTaskInput): Promise<ActionState> {
  const supabase = await createClient();
  const supabaseAdmin = getAdminClient();

  // Validate input
  const result = createTaskSchema.safeParse(input);
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Check if user is admin and get their locale (using admin client to bypass RLS)
  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('role, preferred_locale')
    .eq('id', user.id)
    .single();

  if (userData?.role !== 'admin') {
    return { error: 'Only admins can create tasks' };
  }

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

  // Create task (using admin client)
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
    return { error: 'Failed to create task' };
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
      // Rollback task creation
      await supabaseAdmin.from('tasks').delete().eq('id', task.id);
      return { error: 'Failed to create task assignments' };
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
      // Note: Not rolling back here as the task was created successfully
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
      // Note: Not rolling back here as the task was created successfully
    }
  }
  revalidatePath('/tasks');
  revalidatePath('/dashboard');

  return { success: true, data: { id: task.id } };
}

export async function updateTask(taskId: string, input: UpdateTaskInput): Promise<ActionState> {
  const supabase = await createClient();
  const supabaseAdmin = getAdminClient();

  // Validate input
  const result = updateTaskSchema.safeParse(input);
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Check if user is admin and get locale
  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('role, preferred_locale')
    .eq('id', user.id)
    .single();

  if (userData?.role !== 'admin') {
    return { error: 'Only admins can update tasks' };
  }

  const { assignments, viewers, videos, ...taskData } = result.data;
  const sourceLocale = (userData?.preferred_locale || 'en') as SupportedLocale;

  // Update task
  const updateData: Record<string, unknown> = {};

  // If title or description changed, re-translate
  if (taskData.title !== undefined || taskData.description !== undefined) {
    // Get current task to fill in missing values
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
  if (taskData.isRecurring !== undefined) updateData.is_recurring = taskData.isRecurring;
  if (taskData.recurrenceRule !== undefined) updateData.recurrence_rule = taskData.recurrenceRule;
  if (taskData.syncToCalendar !== undefined) updateData.sync_to_calendar = taskData.syncToCalendar;

  if (Object.keys(updateData).length > 0) {
    const { error: taskError } = await supabaseAdmin
      .from('tasks')
      .update(updateData)
      .eq('id', taskId);

    if (taskError) {
      console.error('Task update error:', taskError);
      return { error: 'Failed to update task' };
    }
  }

  // Update assignments if provided
  if (assignments && assignments.length > 0) {
    // Delete existing assignments
    await supabaseAdmin
      .from('task_assignments')
      .delete()
      .eq('task_id', taskId);

    // Create new assignments
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
      return { error: 'Failed to update task assignments' };
    }
  }

  // Update viewers if provided
  if (viewers !== undefined) {
    // Delete existing viewers
    await supabaseAdmin
      .from('task_viewers')
      .delete()
      .eq('task_id', taskId);

    // Create new viewers if any
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
        // Note: Not returning error as main task was updated
      }
    }
  }
  // Update videos if provided
  if (videos !== undefined) {
    // Delete existing videos
    await supabaseAdmin
      .from('task_videos')
      .delete()
      .eq('task_id', taskId);

    // Create new videos if any
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
        // Note: Not returning error as main task was updated
      }
    }
  }
  revalidatePath('/tasks');
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath('/dashboard');

  return { success: true };
}

export async function deleteTask(taskId: string): Promise<ActionState> {
  const supabase = await createClient();
  const supabaseAdmin = getAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Check if user is admin
  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userData?.role !== 'admin') {
    return { error: 'Only admins can delete tasks' };
  }

  const { error } = await supabaseAdmin
    .from('tasks')
    .delete()
    .eq('id', taskId);

  if (error) {
    console.error('Task deletion error:', error);
    return { error: 'Failed to delete task' };
  }

  revalidatePath('/tasks');
  revalidatePath('/dashboard');

  return { success: true };
}

export async function completeTask(taskId: string): Promise<ActionState> {
  const supabase = await createClient();
  const supabaseAdmin = getAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  const { error } = await supabaseAdmin
    .from('tasks')
    .update({
      status: 'completed',
      completed_by: user.id,
      completed_at: new Date().toISOString(),
    })
    .eq('id', taskId);

  if (error) {
    console.error('Task completion error:', error);
    return { error: 'Failed to complete task' };
  }

  revalidatePath('/tasks');
  revalidatePath('/my-tasks');
  revalidatePath('/dashboard');

  return { success: true };
}

export async function updateTaskStatus(taskId: string, status: 'pending' | 'in_progress' | 'completed'): Promise<ActionState> {
  const supabase = await createClient();
  const supabaseAdmin = getAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  const updateData: Record<string, unknown> = { status };

  if (status === 'completed') {
    updateData.completed_by = user.id;
    updateData.completed_at = new Date().toISOString();
  } else {
    updateData.completed_by = null;
    updateData.completed_at = null;
  }

  const { error } = await supabaseAdmin
    .from('tasks')
    .update(updateData)
    .eq('id', taskId);

  if (error) {
    console.error('Task status update error:', error);
    return { error: 'Failed to update task status' };
  }

  revalidatePath('/tasks');
  revalidatePath('/my-tasks');
  revalidatePath('/dashboard');

  return { success: true };
}

// Complete a specific instance of a recurring task
export async function completeTaskInstance(taskId: string, completionDate: string): Promise<ActionState> {
  const supabase = await createClient();
  const supabaseAdmin = getAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Insert completion record (upsert in case of re-completion)
  const { error } = await supabaseAdmin
    .from('task_completions')
    .upsert({
      task_id: taskId,
      completion_date: completionDate,
      completed_by: user.id,
      completed_at: new Date().toISOString(),
    }, {
      onConflict: 'task_id,completion_date',
    });

  if (error) {
    console.error('Task instance completion error:', error);
    return { error: 'Failed to complete task instance' };
  }

  revalidatePath('/tasks');
  revalidatePath('/my-tasks');
  revalidatePath('/dashboard');

  return { success: true };
}

// Uncomplete a specific instance of a recurring task
export async function uncompleteTaskInstance(taskId: string, completionDate: string): Promise<ActionState> {
  const supabase = await createClient();
  const supabaseAdmin = getAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  const { error } = await supabaseAdmin
    .from('task_completions')
    .delete()
    .eq('task_id', taskId)
    .eq('completion_date', completionDate);

  if (error) {
    console.error('Task instance uncomplete error:', error);
    return { error: 'Failed to uncomplete task instance' };
  }

  revalidatePath('/tasks');
  revalidatePath('/my-tasks');
  revalidatePath('/dashboard');

  return { success: true };
}

// Skip a specific instance of a recurring task
export async function skipTaskInstance(taskId: string, skipDate: string): Promise<ActionState> {
  const supabase = await createClient();
  const supabaseAdmin = getAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Check if user is admin
  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userData?.role !== 'admin') {
    return { error: 'Only admins can skip task instances' };
  }

  const { error } = await supabaseAdmin
    .from('task_skipped_instances')
    .upsert({
      task_id: taskId,
      skipped_date: skipDate,
      skipped_by: user.id,
      skipped_at: new Date().toISOString(),
    }, {
      onConflict: 'task_id,skipped_date',
    });

  if (error) {
    console.error('Task instance skip error:', error);
    return { error: 'Failed to skip task instance' };
  }

  revalidatePath('/tasks');
  revalidatePath('/dashboard');

  return { success: true };
}

// Update task date/time (for drag and drop of regular tasks)
export async function updateTaskDateTime(
  taskId: string,
  dueDate: string,
  dueTime: string | null,
  startTime?: string | null,
  endTime?: string | null
): Promise<ActionState> {
  const supabase = await createClient();
  const supabaseAdmin = getAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Check if user is admin
  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userData?.role !== 'admin') {
    return { error: 'Only admins can move tasks' };
  }

  const updateData: Record<string, unknown> = {
    due_date: dueDate,
    due_time: dueTime,
  };

  if (startTime !== undefined) {
    updateData.start_time = startTime;
  }
  if (endTime !== undefined) {
    updateData.end_time = endTime;
  }

  const { error } = await supabaseAdmin
    .from('tasks')
    .update(updateData)
    .eq('id', taskId);

  if (error) {
    console.error('Task date/time update error:', error);
    return { error: 'Failed to update task date/time' };
  }

  revalidatePath('/tasks');
  revalidatePath('/dashboard');

  return { success: true };
}

// Override time for a specific instance of a recurring task (for drag and drop)
export async function overrideTaskInstanceTime(
  taskId: string,
  instanceDate: string,
  overrideTime: string | null,
  overrideStartTime?: string | null,
  overrideEndTime?: string | null
): Promise<ActionState> {
  const supabase = await createClient();
  const supabaseAdmin = getAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Check if user is admin
  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userData?.role !== 'admin') {
    return { error: 'Only admins can override task instance times' };
  }

  const { error } = await supabaseAdmin
    .from('task_instance_overrides')
    .upsert({
      task_id: taskId,
      instance_date: instanceDate,
      override_time: overrideTime,
      override_start_time: overrideStartTime || null,
      override_end_time: overrideEndTime || null,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'task_id,instance_date',
    });

  if (error) {
    console.error('Task instance override error:', error);
    return { error: 'Failed to override task instance time' };
  }

  revalidatePath('/tasks');
  revalidatePath('/dashboard');

  return { success: true };
}
