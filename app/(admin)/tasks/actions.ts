'use server';

import { createClient, getAdminClient, type ActionState } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// Re-exported from lib/supabase/server
export type { ActionState };

// Note: createTask, updateTask, deleteTask, and skipTaskInstance have been migrated to API routes.
// See: /api/tasks/route.ts, /api/tasks/[id]/route.ts, and /api/tasks/[id]/skip/route.ts

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
