'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { TaskWithRelations, TaskVideo } from '@/types';
import type { CreateTaskInput, UpdateTaskInput } from '@/lib/validators/task';
import { toast } from 'sonner';
import { useTranslations, useLocale } from 'next-intl';
import { parseISO, isBefore, getDay } from 'date-fns';

type SupportedLocale = 'en' | 'es' | 'zh';

type TaskFilters = {
  status?: 'pending' | 'in_progress' | 'completed';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  categoryId?: string;
  search?: string;
};

// Parse date string as local date (not UTC) to avoid timezone issues
function parseLocalDate(dateStr: string): Date {
  return parseISO(dateStr + 'T12:00:00');
}

// Check if a recurring task is due on a specific date
function isRecurringTaskDueOnDate(
  task: { due_date: string | null; recurrence_rule: string | null },
  targetDate: string
): boolean {
  if (!task.due_date || !task.recurrence_rule) return false;

  const taskStartDate = parseLocalDate(task.due_date);
  const target = parseLocalDate(targetDate);
  const rule = task.recurrence_rule;

  // Task can't be due before its start date
  if (isBefore(target, taskStartDate)) return false;

  const freqMatch = rule.match(/FREQ=(\w+)/);
  const byDayMatch = rule.match(/BYDAY=([A-Z,]+)/);
  const intervalMatch = rule.match(/INTERVAL=(\d+)/);

  if (!freqMatch) return false;

  const freq = freqMatch[1];
  const interval = intervalMatch ? parseInt(intervalMatch[1], 10) : 1;
  const byDays = byDayMatch ? byDayMatch[1].split(',') : null;
  const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const allowedDays = byDays ? byDays.map(d => dayMap[d]) : null;

  if (freq === 'DAILY') {
    // Check if target is on the correct interval from start
    const daysDiff = Math.round((target.getTime() - taskStartDate.getTime()) / 86400000);
    return daysDiff >= 0 && daysDiff % interval === 0;
  }

  if (freq === 'WEEKLY') {
    if (allowedDays) {
      // Check if target day of week is in allowed days
      const targetDayOfWeek = getDay(target);
      if (!allowedDays.includes(targetDayOfWeek)) return false;

      // Check interval - we need to be in the correct week
      const weeksDiff = Math.round((target.getTime() - taskStartDate.getTime()) / 604800000);
      // For weekly with BYDAY, interval applies to weeks
      return weeksDiff >= 0 && weeksDiff % interval === 0;
    } else {
      // Simple weekly - same day of week as start
      const daysDiff = Math.round((target.getTime() - taskStartDate.getTime()) / 86400000);
      return daysDiff >= 0 && daysDiff % (7 * interval) === 0;
    }
  }

  if (freq === 'MONTHLY') {
    // Check if same day of month and correct interval
    if (target.getDate() !== taskStartDate.getDate()) return false;
    const monthsDiff = (target.getFullYear() - taskStartDate.getFullYear()) * 12 +
                       (target.getMonth() - taskStartDate.getMonth());
    return monthsDiff >= 0 && monthsDiff % interval === 0;
  }

  if (freq === 'YEARLY') {
    // Check if same month and day, and correct interval
    if (target.getMonth() !== taskStartDate.getMonth() ||
        target.getDate() !== taskStartDate.getDate()) return false;
    const yearsDiff = target.getFullYear() - taskStartDate.getFullYear();
    return yearsDiff >= 0 && yearsDiff % interval === 0;
  }

  return false;
}

export function useTasks(filters?: TaskFilters) {
  const supabase = createClient();
  const locale = useLocale() as SupportedLocale;

  return useQuery({
    queryKey: ['tasks', filters, locale],
    queryFn: async () => {
      // Get today's date for checking recurring task completions
      const today = new Date().toISOString().split('T')[0];

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

      // For status filter, we need special handling for recurring tasks
      // Don't filter recurring tasks by status - we'll determine status from completions
      if (filters?.status) {
        // Only apply status filter to non-recurring tasks
        query = query.or(`and(is_recurring.eq.false,status.eq.${filters.status}),is_recurring.eq.true`);
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

      // Filter recurring tasks to only those due today
      const filteredData = (data || []).filter(task => {
        if (!task.is_recurring) return true;
        // Only show recurring tasks that are due today
        return isRecurringTaskDueOnDate(
          { due_date: task.due_date, recurrence_rule: task.recurrence_rule },
          today
        );
      });

      // Get today's completions for recurring tasks
      const recurringTaskIds = filteredData
        .filter(t => t.is_recurring)
        .map(t => t.id);

      let todayCompletions: Set<string> = new Set();
      if (recurringTaskIds.length > 0) {
        const { data: completions } = await supabase
          .from('task_completions')
          .select('task_id')
          .in('task_id', recurringTaskIds)
          .eq('completion_date', today);

        todayCompletions = new Set((completions || []).map(c => c.task_id));
      }

      // Transform tasks and override status for recurring tasks based on today's completion
      const transformedTasks = filteredData.map((row) => {
        const task = transformTask(row, locale);

        // For recurring tasks, check if today's instance is completed
        if (task.isRecurring) {
          const isTodayCompleted = todayCompletions.has(task.id);
          // Override the status based on today's completion
          task.status = isTodayCompleted ? 'completed' : 'pending';
        }

        return task;
      });

      // Now filter by status if specified (for recurring tasks, status was computed above)
      if (filters?.status) {
        return transformedTasks.filter(task => task.status === filters.status);
      }

      return transformedTasks;
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

      // Get today's date for checking recurring task completions
      const today = new Date().toISOString().split('T')[0];

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

      // Get tasks - for recurring tasks, don't filter by status (we'll check completions separately)
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

      // Filter recurring tasks to only those due today
      const filteredTasks = assignedTasks.filter(task => {
        if (!task.is_recurring) return true;
        // Only show recurring tasks that are due today
        return isRecurringTaskDueOnDate(
          { due_date: task.due_date, recurrence_rule: task.recurrence_rule },
          today
        );
      });

      // Get today's completions for recurring tasks that are due today
      const recurringTaskIds = filteredTasks
        .filter(t => t.is_recurring)
        .map(t => t.id);

      let todayCompletions: Set<string> = new Set();
      if (recurringTaskIds.length > 0) {
        const { data: completions } = await supabase
          .from('task_completions')
          .select('task_id')
          .in('task_id', recurringTaskIds)
          .eq('completion_date', today);

        todayCompletions = new Set((completions || []).map(c => c.task_id));
      }

      // Transform tasks and override status for recurring tasks based on today's completion
      return filteredTasks.map((row) => {
        const task = transformTask(row, locale);

        // For recurring tasks, check if today's instance is completed
        if (task.isRecurring) {
          const isTodayCompleted = todayCompletions.has(task.id);
          // Override the status based on today's completion
          task.status = isTodayCompleted ? 'completed' : 'pending';
        }

        return task;
      });
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
      if (rawVideos && rawVideos.length > 0) {
        console.log('Task videos found:', row.id, rawVideos);
      }
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

// Complete a specific instance of a recurring task
export function useCompleteTaskInstance() {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ taskId, completionDate }: { taskId: string; completionDate: string }) => {
      const response = await fetch(`/api/tasks/${taskId}/complete-instance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completionDate }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to complete task instance');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success(t('tasks.taskCompleted'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Uncomplete a specific instance of a recurring task
export function useUncompleteTaskInstance() {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ taskId, completionDate }: { taskId: string; completionDate: string }) => {
      const response = await fetch(`/api/tasks/${taskId}/complete-instance?completionDate=${completionDate}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to uncomplete task instance');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success(t('tasks.taskUncompleted'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Skip a specific instance of a recurring task
export function useSkipTaskInstance() {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ taskId, skipDate }: { taskId: string; skipDate: string }) => {
      const response = await fetch(`/api/tasks/${taskId}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipDate }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to skip task instance');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success(t('tasks.instanceSkipped'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Update task date/time (for drag and drop of regular tasks)
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

// Override time for a specific instance of a recurring task (for drag and drop)
export function useOverrideTaskInstanceTime() {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({
      taskId,
      instanceDate,
      overrideTime,
      overrideStartTime,
      overrideEndTime,
    }: {
      taskId: string;
      instanceDate: string;
      overrideTime: string | null;
      overrideStartTime?: string | null;
      overrideEndTime?: string | null;
    }) => {
      const response = await fetch(`/api/tasks/${taskId}/override-time`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceDate, overrideTime, overrideStartTime, overrideEndTime }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to override task instance time');
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
