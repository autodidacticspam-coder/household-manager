import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import type { Task, TaskWithRelations, TaskAssignment } from '@/types';

type SupportedLocale = 'en' | 'es' | 'zh';

// Get locale from cookies
async function getLocaleFromCookies(): Promise<SupportedLocale> {
  const cookieStore = await cookies();
  const locale = cookieStore.get('locale')?.value as SupportedLocale;
  return locale || 'en';
}

export type TaskFilters = {
  status?: 'pending' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  categoryId?: string;
  assignedUserId?: string;
  assignedGroupId?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  search?: string;
};

export async function getTasks(filters?: TaskFilters): Promise<TaskWithRelations[]> {
  const supabase = await createClient();
  const locale = await getLocaleFromCookies();

  let query = supabase
    .from('tasks')
    .select(`
      *,
      category:task_categories(*),
      created_by_user:users!tasks_created_by_fkey(id, full_name, avatar_url),
      completed_by_user:users!tasks_completed_by_fkey(id, full_name, avatar_url),
      assignments:task_assignments(
        *,
        target_user:users!task_assignments_target_user_id_fkey(id, full_name, avatar_url),
        target_group:employee_groups!task_assignments_target_group_id_fkey(id, name)
      )
    `)
    .order('created_at', { ascending: false });

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.priority) {
    query = query.eq('priority', filters.priority);
  }

  if (filters?.categoryId) {
    query = query.eq('category_id', filters.categoryId);
  }

  if (filters?.dueDateFrom) {
    query = query.gte('due_date', filters.dueDateFrom);
  }

  if (filters?.dueDateTo) {
    query = query.lte('due_date', filters.dueDateTo);
  }

  if (filters?.search) {
    query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map((row) => transformTask(row, locale));
}

export async function getTaskById(id: string): Promise<TaskWithRelations | null> {
  const supabase = await createClient();
  const locale = await getLocaleFromCookies();

  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      category:task_categories(*),
      created_by_user:users!tasks_created_by_fkey(id, full_name, avatar_url),
      completed_by_user:users!tasks_completed_by_fkey(id, full_name, avatar_url),
      assignments:task_assignments(
        *,
        target_user:users!task_assignments_target_user_id_fkey(id, full_name, avatar_url),
        target_group:employee_groups!task_assignments_target_group_id_fkey(id, name)
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return transformTask(data, locale);
}

export async function getMyTasks(userId: string): Promise<TaskWithRelations[]> {
  const supabase = await createClient();
  const locale = await getLocaleFromCookies();

  // Get user's role
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  const isAdmin = userData?.role === 'admin';

  // Get tasks assigned directly to the user, to their groups, or to all
  const { data: userGroups } = await supabase
    .from('employee_group_memberships')
    .select('group_id')
    .eq('user_id', userId);

  const groupIds = (userGroups || []).map((g) => g.group_id);

  const { data, error } = await supabase
    .from('tasks')
    .select(`
      *,
      category:task_categories(*),
      created_by_user:users!tasks_created_by_fkey(id, full_name, avatar_url),
      completed_by_user:users!tasks_completed_by_fkey(id, full_name, avatar_url),
      assignments:task_assignments(
        *,
        target_user:users!task_assignments_target_user_id_fkey(id, full_name, avatar_url),
        target_group:employee_groups!task_assignments_target_group_id_fkey(id, name)
      )
    `)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Filter tasks that are assigned to this user
  const filteredTasks = (data || []).filter((task) => {
    return task.assignments.some((assignment: { target_type: string; target_user_id: string; target_group_id: string }) => {
      if (assignment.target_type === 'all') return true;
      if (assignment.target_type === 'all_admins' && isAdmin) return true;
      if (assignment.target_type === 'user' && assignment.target_user_id === userId) return true;
      if (assignment.target_type === 'group' && groupIds.includes(assignment.target_group_id)) return true;
      return false;
    });
  });

  return filteredTasks.map((row) => transformTask(row, locale));
}

export async function getTaskCategories() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('task_categories')
    .select('*')
    .order('name');

  if (error) throw error;

  return data || [];
}

export async function getEmployeeGroups() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('employee_groups')
    .select('*')
    .order('name');

  if (error) throw error;

  return data || [];
}

export async function getEmployees() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, avatar_url, role')
    .eq('role', 'employee')
    .order('full_name');

  if (error) throw error;

  return data || [];
}

export async function getAllUsers() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, avatar_url, role')
    .order('full_name');

  if (error) throw error;

  return data || [];
}

// Helper function to get translated content based on locale
function getTranslatedTitle(row: Record<string, unknown>, locale: SupportedLocale): string {
  const title = row.title as string;
  if (locale === 'es' && row.title_es) return row.title_es as string;
  if (locale === 'zh' && row.title_zh) return row.title_zh as string;
  return title;
}

function getTranslatedDescription(row: Record<string, unknown>, locale: SupportedLocale): string | null {
  const description = row.description as string | null;
  if (!description) return null;
  if (locale === 'es' && row.description_es) return row.description_es as string;
  if (locale === 'zh' && row.description_zh) return row.description_zh as string;
  return description;
}

// Helper function to transform database row to TaskWithRelations
function transformTask(row: Record<string, unknown>, locale: SupportedLocale = 'en'): TaskWithRelations {
  return {
    id: row.id as string,
    title: getTranslatedTitle(row, locale),
    titleEs: row.title_es as string | null,
    titleZh: row.title_zh as string | null,
    description: getTranslatedDescription(row, locale),
    descriptionEs: row.description_es as string | null,
    descriptionZh: row.description_zh as string | null,
    sourceLocale: row.source_locale as string | null,
    categoryId: row.category_id as string | null,
    priority: row.priority as 'low' | 'medium' | 'high' | 'urgent',
    status: row.status as 'pending' | 'in_progress' | 'completed',
    dueDate: row.due_date as string | null,
    dueTime: row.due_time as string | null,
    isAllDay: row.is_all_day as boolean,
    isRecurring: row.is_recurring as boolean,
    recurrenceRule: row.recurrence_rule as string | null,
    googleCalendarEventId: row.google_calendar_event_id as string | null,
    syncToCalendar: row.sync_to_calendar as boolean,
    createdBy: row.created_by as string | null,
    completedBy: row.completed_by as string | null,
    completedAt: row.completed_at as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    category: row.category as { id: string; name: string; color: string; icon: string | null } | null,
    createdByUser: row.created_by_user as { id: string; fullName: string; avatarUrl: string | null } | null,
    completedByUser: row.completed_by_user as { id: string; fullName: string; avatarUrl: string | null } | null,
    assignments: ((row.assignments as Record<string, unknown>[]) || []).map((a) => ({
      id: a.id as string,
      taskId: a.task_id as string,
      targetType: a.target_type as 'user' | 'group' | 'all',
      targetUserId: a.target_user_id as string | null,
      targetGroupId: a.target_group_id as string | null,
      createdAt: a.created_at as string,
      targetUser: a.target_user as { id: string; fullName: string; avatarUrl: string | null } | null,
      targetGroup: a.target_group as { id: string; name: string } | null,
    })),
  };
}
