'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { ChildLogWithUser, ChildLogCategory, ChildName } from '@/types';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

type ChildLogFilters = {
  child?: ChildName;
  category?: ChildLogCategory;
  startDate?: string;
  endDate?: string;
};

export function useChildLogs(filters?: ChildLogFilters) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['child-logs', filters],
    queryFn: async () => {
      let query = supabase
        .from('child_logs')
        .select(`
          *,
          logged_by_user:users!child_logs_logged_by_fkey(id, full_name, avatar_url)
        `)
        .order('log_date', { ascending: false })
        .order('log_time', { ascending: false });

      if (filters?.child) {
        query = query.eq('child', filters.child);
      }

      if (filters?.category) {
        query = query.eq('category', filters.category);
      }

      if (filters?.startDate) {
        query = query.gte('log_date', filters.startDate);
      }

      if (filters?.endDate) {
        query = query.lte('log_date', filters.endDate);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map((row) => transformChildLog(row));
    },
  });
}

export function useRecentChildLogs(limit: number = 10) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['child-logs-recent', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('child_logs')
        .select(`
          *,
          logged_by_user:users!child_logs_logged_by_fkey(id, full_name, avatar_url)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return (data || []).map((row) => transformChildLog(row));
    },
  });
}

export function useCreateChildLog() {
  const queryClient = useQueryClient();
  const supabase = createClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (input: {
      child: ChildName;
      category: ChildLogCategory;
      logDate: string;
      logTime: string;
      startTime?: string | null;
      endTime?: string | null;
      description?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('child_logs')
        .insert({
          child: input.child,
          category: input.category,
          log_date: input.logDate,
          log_time: input.logTime,
          start_time: input.startTime || null,
          end_time: input.endTime || null,
          description: input.description || null,
          logged_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['child-logs'] });
      queryClient.invalidateQueries({ queryKey: ['child-logs-recent'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success(t('childLogs.logCreated'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteChildLog() {
  const queryClient = useQueryClient();
  const supabase = createClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('child_logs')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['child-logs'] });
      queryClient.invalidateQueries({ queryKey: ['child-logs-recent'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success(t('childLogs.logDeleted'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Check if user can access child logs (admin or in Nanny/Teacher group)
export function useCanAccessChildLogs() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['can-access-child-logs'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      // Check if admin
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (userData?.role === 'admin') return true;

      // Check if in Nanny or Teacher group
      const { data: membership } = await supabase
        .from('employee_group_memberships')
        .select(`
          group:employee_groups!inner(name)
        `)
        .eq('user_id', user.id);

      if (membership) {
        const allowedGroups = ['nanny', 'teacher'];
        return membership.some((m: any) =>
          allowedGroups.includes(m.group?.name?.toLowerCase())
        );
      }

      return false;
    },
  });
}

// Helper function to transform database row
function transformChildLog(row: Record<string, unknown>): ChildLogWithUser {
  const loggedByUser = row.logged_by_user as { id: string; full_name: string; avatar_url: string | null } | null;

  return {
    id: row.id as string,
    child: row.child as ChildName,
    category: row.category as ChildLogCategory,
    logDate: row.log_date as string,
    logTime: row.log_time as string,
    startTime: row.start_time as string | null,
    endTime: row.end_time as string | null,
    description: row.description as string | null,
    loggedBy: row.logged_by as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    loggedByUser: loggedByUser ? {
      id: loggedByUser.id,
      fullName: loggedByUser.full_name,
      avatarUrl: loggedByUser.avatar_url,
    } : null,
  };
}
