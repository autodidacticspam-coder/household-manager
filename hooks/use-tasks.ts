'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { TaskWithRelations } from '@/types';
import { createTask, updateTask, deleteTask, completeTask, updateTaskStatus } from '@/app/(admin)/tasks/actions';
import type { CreateTaskInput, UpdateTaskInput } from '@/lib/validators/task';
import { toast } from 'sonner';
import { useTranslations, useLocale } from 'next-intl';

type SupportedLocale = 'en' | 'es' | 'zh';

type TaskFilters = {
  status?: 'pending' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  categoryId?: string;
  search?: string;
};

export function useTasks(filters?: TaskFilters) {
  const supabase = createClient();
  const locale = useLocale() as SupportedLocale;

  return useQuery({
    queryKey: ['tasks', filters, locale],
    queryFn: async () => {
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

      if (filters?.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((row) => transformTask(row, locale));
    },
  });
}

export function useTask(id: string) {
  const supabase = createClient();
  const locale = useLocale() as SupportedLocale;

  return useQuery({
    queryKey: ['task', id, locale],
    queryFn: async () => {
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

      if (error) throw error;

      return transformTask(data, locale);
    },
    enabled: !!id,
  });
}

export function useMyTasks(userId?: string) {
  const supabase = createClient();
  const locale = useLocale() as SupportedLocale;

  return useQuery({
    queryKey: ['my-tasks', userId, locale],
    queryFn: async () => {
      if (!userId) return [];

      // Get user's role
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

      const isAdmin = userData?.role === 'admin';

      // Get user's group memberships
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

      // Filter tasks assigned to this user
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
    },
    enabled: !!userId,
  });
}

export function useTaskCategories() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['task-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_categories')
        .select('*')
        .order('name');

      if (error) throw error;

      return data || [];
    },
  });
}

export function useEmployeeGroups() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['employee-groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_groups')
        .select('*')
        .order('name');

      if (error) throw error;

      return data || [];
    },
  });
}

export function useEmployees() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, avatar_url, role')
        .in('role', ['employee', 'admin'])
        .order('full_name');

      if (error) throw error;

      return data || [];
    },
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const result = await createTask(input);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(t('tasks.taskCreated'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateTaskInput }) => {
      const result = await updateTask(id, data);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(t('tasks.taskUpdated'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteTask(id);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(t('tasks.taskDeleted'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await completeTask(id);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      toast.success(t('tasks.taskCompleted'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'pending' | 'in_progress' | 'completed' }) => {
      const result = await updateTaskStatus(id, status);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function usePendingTasks() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['pending-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, priority, due_date')
        .in('status', ['pending', 'in_progress'])
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data || [];
    },
  });
}

export function useOverdueTasks() {
  const supabase = createClient();
  const today = new Date().toISOString().split('T')[0];

  return useQuery({
    queryKey: ['overdue-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, priority, due_date, is_recurring')
        .in('status', ['pending', 'in_progress'])
        .lt('due_date', today)
        .eq('is_recurring', false) // Don't show recurring tasks from previous days as overdue
        .order('due_date', { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });
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
    isActivity: row.is_activity as boolean,
    startTime: row.start_time as string | null,
    endTime: row.end_time as string | null,
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
    createdByUser: (() => {
      const raw = row.created_by_user as { id: string; full_name: string; avatar_url: string | null } | null;
      return raw ? { id: raw.id, fullName: raw.full_name, avatarUrl: raw.avatar_url } : null;
    })(),
    completedByUser: (() => {
      const raw = row.completed_by_user as { id: string; full_name: string; avatar_url: string | null } | null;
      return raw ? { id: raw.id, fullName: raw.full_name, avatarUrl: raw.avatar_url } : null;
    })(),
    assignments: ((row.assignments as Record<string, unknown>[]) || []).map((a) => {
      const targetUserRaw = a.target_user as { id: string; full_name: string; avatar_url: string | null } | null;
      const targetGroupRaw = a.target_group as { id: string; name: string } | null;
      return {
        id: a.id as string,
        taskId: a.task_id as string,
        targetType: a.target_type as 'user' | 'group' | 'all',
        targetUserId: a.target_user_id as string | null,
        targetGroupId: a.target_group_id as string | null,
        createdAt: a.created_at as string,
        targetUser: targetUserRaw ? {
          id: targetUserRaw.id,
          fullName: targetUserRaw.full_name,
          avatarUrl: targetUserRaw.avatar_url,
        } : null,
        targetGroup: targetGroupRaw,
      };
    }),
  };
}
