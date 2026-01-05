'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { TaskWithRelations, TaskVideo } from '@/types';
import type { CreateTaskInput, UpdateTaskInput } from '@/lib/validators/task';
import { toast } from 'sonner';
import { useTranslations, useLocale } from 'next-intl';
import { getTodayString } from '@/lib/date-utils';

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
  const today = getTodayString();

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
          ),
          videos:task_videos(*)
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

      // For pending/in_progress tasks, filter to show only next occurrence of repeating tasks
      const shouldFilterRepeats = !filters?.status || filters.status === 'pending' || filters.status === 'in_progress';

      if (shouldFilterRepeats && data) {
        // Group tasks by title + created_at to identify repeat batches
        const taskBatches = new Map<string, typeof data>();

        for (const task of data) {
          const createdAtTruncated = task.created_at?.slice(0, 19) || '';
          const batchKey = `${task.title}|${createdAtTruncated}`;

          if (!taskBatches.has(batchKey)) {
            taskBatches.set(batchKey, []);
          }
          taskBatches.get(batchKey)!.push(task);
        }

        // For each batch, keep only the next occurrence
        const filteredData: typeof data = [];

        for (const [, batchTasks] of taskBatches) {
          if (batchTasks.length === 1) {
            filteredData.push(batchTasks[0]);
          } else {
            // Multiple tasks - find the next occurrence (earliest due_date >= today)
            const futureTasks = batchTasks.filter(t => !t.due_date || t.due_date >= today);

            if (futureTasks.length > 0) {
              futureTasks.sort((a, b) => {
                if (!a.due_date) return 1;
                if (!b.due_date) return -1;
                return a.due_date.localeCompare(b.due_date);
              });
              filteredData.push(futureTasks[0]);
            } else {
              // All tasks are in the past - show the most recent one
              batchTasks.sort((a, b) => {
                if (!a.due_date) return 1;
                if (!b.due_date) return -1;
                return b.due_date.localeCompare(a.due_date);
              });
              filteredData.push(batchTasks[0]);
            }
          }
        }

        // Sort by due_date for display
        filteredData.sort((a, b) => {
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return a.due_date.localeCompare(b.due_date);
        });

        return filteredData.map((row) => transformTask(row, locale));
      }

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
          ),
          viewers:task_viewers(
            *,
            target_user:users!task_viewers_target_user_id_fkey(id, full_name, avatar_url),
            target_group:employee_groups!task_viewers_target_group_id_fkey(id, name)
          ),
          videos:task_videos(*)

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

      // Get tasks
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
          ),
          videos:task_videos(*)
        `)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter tasks assigned to this user
      const assignedTasks = (data || []).filter((task) => {
        return task.assignments.some((assignment: { target_type: string; target_user_id: string; target_group_id: string }) => {
          if (assignment.target_type === 'all') return true;
          if (assignment.target_type === 'all_admins' && isAdmin) return true;
          if (assignment.target_type === 'user' && assignment.target_user_id === userId) return true;
          if (assignment.target_type === 'group' && groupIds.includes(assignment.target_group_id)) return true;
          return false;
        });
      });

      return assignedTasks.map((row) => transformTask(row, locale));
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
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to create task');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
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
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to update task');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
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
      const response = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
      });

      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to delete task');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
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
      const response = await fetch(`/api/tasks/${id}/complete`, {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to complete task');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
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
      const response = await fetch(`/api/tasks/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to update task status');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function usePendingTasks() {
  const supabase = createClient();
  const today = getTodayString();

  return useQuery({
    queryKey: ['pending-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, priority, due_date, created_at')
        .in('status', ['pending', 'in_progress'])
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) throw error;

      // Group tasks by title + created_at to identify repeat batches
      // (tasks created from the same repeat batch have identical title and created_at)
      const taskBatches = new Map<string, typeof data>();

      for (const task of data || []) {
        // Create a batch key using title and created_at (truncated to second for safety)
        const createdAtTruncated = task.created_at?.slice(0, 19) || '';
        const batchKey = `${task.title}|${createdAtTruncated}`;

        if (!taskBatches.has(batchKey)) {
          taskBatches.set(batchKey, []);
        }
        taskBatches.get(batchKey)!.push(task);
      }

      // For each batch, keep only the next occurrence (earliest due_date >= today)
      const filteredTasks: typeof data = [];

      for (const [, batchTasks] of taskBatches) {
        if (batchTasks.length === 1) {
          // Single task, not part of a repeat batch
          filteredTasks.push(batchTasks[0]);
        } else {
          // Multiple tasks - find the next occurrence (earliest due_date >= today)
          // First, filter to future tasks
          const futureTasks = batchTasks.filter(t => !t.due_date || t.due_date >= today);

          if (futureTasks.length > 0) {
            // Sort by due_date ascending and take the first one
            futureTasks.sort((a, b) => {
              if (!a.due_date) return 1;
              if (!b.due_date) return -1;
              return a.due_date.localeCompare(b.due_date);
            });
            filteredTasks.push(futureTasks[0]);
          } else {
            // All tasks are in the past - show the most recent one
            batchTasks.sort((a, b) => {
              if (!a.due_date) return 1;
              if (!b.due_date) return -1;
              return b.due_date.localeCompare(a.due_date);
            });
            filteredTasks.push(batchTasks[0]);
          }
        }
      }

      // Sort final list by due_date
      filteredTasks.sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return a.due_date.localeCompare(b.due_date);
      });

      return filteredTasks;
    },
  });
}

export function useOverdueTasks() {
  const supabase = createClient();
  const today = getTodayString();

  return useQuery({
    queryKey: ['overdue-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, priority, due_date')
        .in('status', ['pending', 'in_progress'])
        .lt('due_date', today)
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
    viewers: ((row.viewers as Record<string, unknown>[]) || []).map((v) => {
      const targetUserRaw = v.target_user as { id: string; full_name: string; avatar_url: string | null } | null;
      const targetGroupRaw = v.target_group as { id: string; name: string } | null;
      return {
        id: v.id as string,
        taskId: v.task_id as string,
        targetType: v.target_type as 'user' | 'group' | 'all' | 'all_admins',
        targetUserId: v.target_user_id as string | null,
        targetGroupId: v.target_group_id as string | null,
        createdAt: v.created_at as string,
        targetUser: targetUserRaw ? {
          id: targetUserRaw.id,
          fullName: targetUserRaw.full_name,
          avatarUrl: targetUserRaw.avatar_url,
        } : null,
        targetGroup: targetGroupRaw,
      };
    }),
    videos: (() => {
      const rawVideos = row.videos as Array<{ id: string; task_id: string; url: string; title: string | null; video_type: 'upload' | 'link'; file_name: string | null; file_size: number | null; mime_type: string | null; created_at: string; created_by: string | null }> | null;
      return (rawVideos || []).map(v => ({
        id: v.id,
        taskId: v.task_id,
        url: v.url,
        title: v.title,
        videoType: v.video_type,
        fileName: v.file_name,
        fileSize: v.file_size,
        mimeType: v.mime_type,
        createdAt: v.created_at,
        createdBy: v.created_by,
      }));
    })(),
  };
}

export function useQuickAssign() {
  const queryClient = useQueryClient();
  const supabase = createClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ taskId, userId }: { taskId: string; userId: string }) => {
      // Check if assignment already exists
      const { data: existing } = await supabase
        .from('task_assignments')
        .select('id')
        .eq('task_id', taskId)
        .eq('target_user_id', userId)
        .single();

      if (existing) {
        throw new Error(t('tasks.alreadyAssigned'));
      }

      // Add the assignment
      const { data, error } = await supabase
        .from('task_assignments')
        .insert({
          task_id: taskId,
          target_type: 'user',
          target_user_id: userId,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success(t('tasks.assignedSuccess'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Update task date/time (for drag and drop)
export function useUpdateTaskDateTime() {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({
      taskId,
      dueDate,
      dueTime,
      startTime,
      endTime,
    }: {
      taskId: string;
      dueDate: string;
      dueTime: string | null;
      startTime?: string | null;
      endTime?: string | null;
    }) => {
      const response = await fetch(`/api/tasks/${taskId}/datetime`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate, dueTime, startTime, endTime }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to update task date/time');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success(t('tasks.taskMoved'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

