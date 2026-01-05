'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import type { EmployeeSchedule, EmployeeScheduleWithUser, ScheduleFormData, ScheduleOverride, ScheduleOverrideFormData } from '@/types';

// Get schedules for a specific employee
export function useEmployeeSchedules(userId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['employee-schedules', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_schedules')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('day_of_week')
        .order('start_time');

      if (error) throw error;

      return (data || []).map(transformSchedule);
    },
    enabled: !!userId,
  });
}

// Get all active schedules (for calendar display)
export function useAllSchedules() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['all-employee-schedules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_schedules')
        .select(`
          *,
          user:users!employee_schedules_user_id_fkey(id, full_name, avatar_url)
        `)
        .eq('is_active', true)
        .order('day_of_week')
        .order('start_time');

      if (error) throw error;

      return (data || []).map((row): EmployeeScheduleWithUser => ({
        ...transformSchedule(row),
        user: row.user ? {
          id: row.user.id,
          fullName: row.user.full_name,
          avatarUrl: row.user.avatar_url,
        } : undefined,
      }));
    },
  });
}

// Create a new schedule entry
export function useCreateSchedule() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ userId, ...data }: ScheduleFormData & { userId: string }) => {
      const { data: result, error } = await supabase
        .from('employee_schedules')
        .insert({
          user_id: userId,
          day_of_week: data.dayOfWeek,
          start_time: data.startTime,
          end_time: data.endTime,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['employee-schedules', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['all-employee-schedules'] });
      toast.success(t('common.saved'));
    },
    onError: (error) => {
      console.error('Error creating schedule:', error);
      toast.error(t('errors.saveFailed'));
    },
  });
}

// Update an existing schedule entry
export function useUpdateSchedule() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ id, userId, ...data }: ScheduleFormData & { id: string; userId: string }) => {
      const { data: result, error } = await supabase
        .from('employee_schedules')
        .update({
          day_of_week: data.dayOfWeek,
          start_time: data.startTime,
          end_time: data.endTime,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['employee-schedules', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['all-employee-schedules'] });
      toast.success(t('common.saved'));
    },
    onError: (error) => {
      console.error('Error updating schedule:', error);
      toast.error(t('errors.saveFailed'));
    },
  });
}

// Delete a schedule entry
export function useDeleteSchedule() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ id, userId }: { id: string; userId: string }) => {
      const { error } = await supabase
        .from('employee_schedules')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['employee-schedules', variables.userId] });
      queryClient.invalidateQueries({ queryKey: ['all-employee-schedules'] });
      toast.success(t('common.deleted'));
    },
    onError: (error) => {
      console.error('Error deleting schedule:', error);
      toast.error(t('errors.deleteFailed'));
    },
  });
}

// Helper to transform database row to EmployeeSchedule
function transformSchedule(row: Record<string, unknown>): EmployeeSchedule {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    dayOfWeek: row.day_of_week as number,
    startTime: row.start_time as string,
    endTime: row.end_time as string,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// Helper to transform database row to ScheduleOverride
function transformOverride(row: Record<string, unknown>): ScheduleOverride {
  return {
    id: row.id as string,
    scheduleId: row.schedule_id as string,
    overrideDate: row.override_date as string,
    startTime: row.start_time as string | null,
    endTime: row.end_time as string | null,
    isCancelled: row.is_cancelled as boolean,
    notes: row.notes as string | null,
    createdBy: row.created_by as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// Get schedule overrides for a date range
export function useScheduleOverrides(startDate: string, endDate: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['schedule-overrides', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedule_overrides')
        .select('*')
        .gte('override_date', startDate)
        .lte('override_date', endDate);

      if (error) throw error;

      return (data || []).map(transformOverride);
    },
    enabled: !!startDate && !!endDate,
  });
}

// Create or update a schedule override
export function useUpsertScheduleOverride() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (data: ScheduleOverrideFormData) => {
      // Check if override already exists
      const { data: existing } = await supabase
        .from('schedule_overrides')
        .select('id')
        .eq('schedule_id', data.scheduleId)
        .eq('override_date', data.overrideDate)
        .single();

      if (existing) {
        // Update existing override
        const { data: result, error } = await supabase
          .from('schedule_overrides')
          .update({
            start_time: data.isCancelled ? null : data.startTime,
            end_time: data.isCancelled ? null : data.endTime,
            is_cancelled: data.isCancelled || false,
            notes: data.notes,
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        return result;
      } else {
        // Create new override
        const { data: user } = await supabase.auth.getUser();
        const { data: result, error } = await supabase
          .from('schedule_overrides')
          .insert({
            schedule_id: data.scheduleId,
            override_date: data.overrideDate,
            start_time: data.isCancelled ? null : data.startTime,
            end_time: data.isCancelled ? null : data.endTime,
            is_cancelled: data.isCancelled || false,
            notes: data.notes,
            created_by: user?.user?.id,
          })
          .select()
          .single();

        if (error) throw error;
        return result;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-overrides'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success(t('common.saved'));
    },
    onError: (error) => {
      console.error('Error saving schedule override:', error);
      toast.error(t('errors.saveFailed'));
    },
  });
}

// Delete a schedule override (restore to normal schedule)
export function useDeleteScheduleOverride() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ scheduleId, overrideDate }: { scheduleId: string; overrideDate: string }) => {
      const { error } = await supabase
        .from('schedule_overrides')
        .delete()
        .eq('schedule_id', scheduleId)
        .eq('override_date', overrideDate);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule-overrides'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success(t('common.deleted'));
    },
    onError: (error) => {
      console.error('Error deleting schedule override:', error);
      toast.error(t('errors.deleteFailed'));
    },
  });
}

// ============================================
// One-Off Schedule Hooks (for single-day schedules)
// ============================================

export type OneOffSchedule = {
  id: string;
  userId: string;
  scheduleDate: string;
  startTime: string;
  endTime: string;
  createdAt: string;
  createdBy: string | null;
  user?: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
  };
};

// Fetch one-off schedules for a date range
export function useOneOffSchedules(startDate: string, endDate: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['one-off-schedules', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedule_one_offs')
        .select(`
          *,
          user:users(id, full_name, avatar_url)
        `)
        .gte('schedule_date', startDate)
        .lte('schedule_date', endDate)
        .order('schedule_date', { ascending: true });

      if (error) throw error;

      return (data || []).map((row): OneOffSchedule => ({
        id: row.id,
        userId: row.user_id,
        scheduleDate: row.schedule_date,
        startTime: row.start_time,
        endTime: row.end_time,
        createdAt: row.created_at,
        createdBy: row.created_by,
        user: row.user ? {
          id: row.user.id,
          fullName: row.user.full_name,
          avatarUrl: row.user.avatar_url,
        } : undefined,
      }));
    },
    enabled: !!startDate && !!endDate,
  });
}

// Create a one-off schedule
export function useCreateOneOffSchedule() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (data: {
      userId: string;
      scheduleDate: string;
      startTime: string;
      endTime: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: result, error } = await supabase
        .from('schedule_one_offs')
        .insert({
          user_id: data.userId,
          schedule_date: data.scheduleDate,
          start_time: data.startTime,
          end_time: data.endTime,
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['one-off-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success(t('common.saved'));
    },
    onError: (error) => {
      console.error('Error creating one-off schedule:', error);
      toast.error(t('errors.saveFailed'));
    },
  });
}

// Update a one-off schedule
export function useUpdateOneOffSchedule() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (data: {
      id: string;
      startTime: string;
      endTime: string;
    }) => {
      const { data: result, error } = await supabase
        .from('schedule_one_offs')
        .update({
          start_time: data.startTime,
          end_time: data.endTime,
        })
        .eq('id', data.id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['one-off-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success(t('common.saved'));
    },
    onError: (error) => {
      console.error('Error updating one-off schedule:', error);
      toast.error(t('errors.saveFailed'));
    },
  });
}

// Delete a one-off schedule
export function useDeleteOneOffSchedule() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('schedule_one_offs')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['one-off-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success(t('common.deleted'));
    },
    onError: (error) => {
      console.error('Error deleting one-off schedule:', error);
      toast.error(t('errors.deleteFailed'));
    },
  });
}
