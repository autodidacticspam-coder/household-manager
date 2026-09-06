import { createClient } from '@/lib/supabase/server';
import { ApiError } from '@/lib/supabase/api-helpers';

export type TaskAction = 'view' | 'complete' | 'edit';

/** The database function is also used by RLS and background exports. */
export async function requireTaskPermission(taskId: string, action: TaskAction) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId)) {
    throw new ApiError('Invalid task ID', 400);
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new ApiError('Not authenticated', 401);
  const { data, error } = await supabase.rpc('can_access_task', { p_task_id: taskId, p_action: action });
  if (error) throw new ApiError('Unable to check task access', 500);
  if (data !== true) throw new ApiError('You do not have permission for this task action', 403);
  return { user, supabase };
}
