'use server';

import type { ActionState } from '@/lib/supabase/server';
import { handleApiError } from '@/lib/supabase/api-helpers';
import { requireTaskPermission, type TaskAction } from '@/lib/task-permissions';

export type { ActionState };

type TaskContext = Awaited<ReturnType<typeof requireTaskPermission>>;

async function taskAction(taskId: string, action: TaskAction, mutate: (context: TaskContext) => PromiseLike<{ error: { message: string } | null }>): Promise<ActionState> {
  try {
    const context = await requireTaskPermission(taskId, action);
    const { error } = await mutate(context);
    if (error) return { error: error.message };
    return { success: true };
  } catch (error) {
    return { error: handleApiError(error).error };
  }
}

export async function completeTask(taskId: string): Promise<ActionState> {
  return updateTaskStatus(taskId, 'completed');
}

export async function updateTaskStatus(taskId: string, status: 'pending' | 'in_progress' | 'completed'): Promise<ActionState> {
  if (!['pending', 'in_progress', 'completed'].includes(status)) return { error: 'Invalid task status' };
  return taskAction(taskId, 'complete', ({ user, supabase }) => supabase.from('tasks').update({
    status,
    completed_by: status === 'completed' ? user.id : null,
    completed_at: status === 'completed' ? new Date().toISOString() : null,
  }).eq('id', taskId).select('id').single());
}

export async function completeTaskInstance(taskId: string, completionDate: string): Promise<ActionState> {
  return taskAction(taskId, 'complete', ({ user, supabase }) => supabase.from('task_completions').upsert({
    task_id: taskId,
    completion_date: completionDate,
    completed_by: user.id,
    completed_at: new Date().toISOString(),
  }, { onConflict: 'task_id,completion_date' }));
}

export async function uncompleteTaskInstance(taskId: string, completionDate: string): Promise<ActionState> {
  return taskAction(taskId, 'complete', ({ supabase }) => supabase.from('task_completions').delete()
    .eq('task_id', taskId).eq('completion_date', completionDate));
}

export async function updateTaskDateTime(taskId: string, dueDate: string, dueTime: string | null, startTime?: string | null, endTime?: string | null): Promise<ActionState> {
  return taskAction(taskId, 'edit', ({ supabase }) => supabase.from('tasks').update({
    due_date: dueDate,
    due_time: dueTime,
    ...(startTime !== undefined ? { start_time: startTime } : {}),
    ...(endTime !== undefined ? { end_time: endTime } : {}),
  }).eq('id', taskId).select('id').single());
}

export async function overrideTaskInstanceTime(taskId: string, instanceDate: string, overrideTime: string | null, overrideStartTime?: string | null, overrideEndTime?: string | null): Promise<ActionState> {
  return taskAction(taskId, 'edit', ({ user, supabase }) => supabase.from('task_instance_overrides').upsert({
    task_id: taskId,
    instance_date: instanceDate,
    override_time: overrideTime,
    override_start_time: overrideStartTime || null,
    override_end_time: overrideEndTime || null,
    created_by: user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'task_id,instance_date' }));
}
