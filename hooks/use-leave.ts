'use client';
import { useFeedback } from '@/hooks/use-feedback';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { LeaveRequest, LeaveBalance } from '@/types';
import {
  createLeaveRequest,
  approveLeaveRequest,
  denyLeaveRequest,
  cancelLeaveRequest,
} from '@/app/(employee)/time-off/actions';
import type { CreateLeaveRequestInput } from '@/lib/validators/leave';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { getZonedParts, getZonedDateString } from '@/lib/timezone';
import { isOnLeaveAt, storedLeaveDates } from '@/lib/leave-dates';

type LeaveFilters = {
  status?: 'pending' | 'approved' | 'denied';
  leaveType?: LeaveRequest['leaveType'];
};

export function useLeaveRequests(filters?: LeaveFilters) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['leave-requests', filters],
    queryFn: async () => {
      let query = supabase
        .from('leave_requests')
        .select(`
          *,
          user:users!leave_requests_user_id_fkey(id, full_name, avatar_url, email),
          reviewed_by_user:users!leave_requests_reviewed_by_fkey(id, full_name)
        `)
        .order('start_date', { ascending: true });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.leaveType) {
        query = query.eq('leave_type', filters.leaveType);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(transformLeaveRequest);
    },
  });
}

export function useMyLeaveRequests(userId?: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['my-leave-requests', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('leave_requests')
        .select(`
          *,
          user:users!leave_requests_user_id_fkey(id, full_name, avatar_url, email),
          reviewed_by_user:users!leave_requests_reviewed_by_fkey(id, full_name)
        `)
        .eq('user_id', userId)
        .order('start_date', { ascending: true });

      if (error) throw error;

      return (data || []).map(transformLeaveRequest);
    },
    enabled: !!userId,
  });
}

export function usePendingLeaveRequests() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['pending-leave-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leave_requests')
        .select(`
          *,
          user:users!leave_requests_user_id_fkey(id, full_name, avatar_url, email),
          reviewed_by_user:users!leave_requests_reviewed_by_fkey(id, full_name)
        `)
        .eq('status', 'pending')
        .order('start_date', { ascending: true });

      if (error) throw error;

      return (data || []).map(transformLeaveRequest);
    },
  });
}

export function useLeaveBalance(userId?: string, year?: number) {
  const supabase = createClient();
  const targetYear = year || new Date().getFullYear();

  return useQuery({
    queryKey: ['leave-balance', userId, targetYear],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from('leave_balances')
        .select('*')
        .eq('user_id', userId)
        .eq('year', targetYear)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No balance record, return defaults
          return {
            id: '',
            userId,
            year: targetYear,
            ptoTotal: 15,
            ptoUsed: 0,
            sickTotal: 10,
            sickUsed: 0,
          } as LeaveBalance;
        }
        throw error;
      }

      return {
        id: data.id,
        userId: data.user_id,
        year: data.year,
        ptoTotal: Number(data.vacation_total),
        ptoUsed: Number(data.vacation_used),
        sickTotal: parseFloat(data.sick_total),
        sickUsed: parseFloat(data.sick_used),
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      } as LeaveBalance;
    },
    enabled: !!userId,
  });
}

export function useUpcomingLeave() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['upcoming-leave'],
    queryFn: async () => {
      const today = getZonedDateString(new Date());

      const { data, error } = await supabase
        .from('leave_requests')
        .select(`
          *,
          user:users!leave_requests_user_id_fkey(id, full_name, avatar_url, email)
        `)
        .eq('status', 'approved')
        .gte('start_date', today)
        .order('start_date', { ascending: true })
        .limit(10);

      if (error) throw error;

      return (data || []).map(transformLeaveRequest);
    },
  });
}

export function useCurrentlyOnLeave() {
  const supabase = createClient();
  return useQuery({
    queryKey: ['currently-on-leave'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const now = getZonedParts(new Date());
      const { data, error } = await supabase.from('leave_requests')
        .select('*, user:users!leave_requests_user_id_fkey(id, full_name, avatar_url, email)')
        .eq('status', 'approved').lte('start_date', now.date).gte('end_date', now.date)
        .order('start_date');
      if (error) throw error;
      return (data || []).filter(row => isOnLeaveAt(storedLeaveDates(row), now.date, now.time)).map(transformLeaveRequest);
    },
  });
}

export function useCreateLeaveRequest() {
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (input: CreateLeaveRequestInput) => {
      const result = await createLeaveRequest(input);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['currently-on-leave'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-leave'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balance'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success(t('leave.requestSubmitted'));
    },
    onError: (error: Error) => {
      toast.error(feedback(error.message));
    },
  });
}

export function useApproveLeaveRequest() {
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ id, adminNotes }: { id: string; adminNotes?: string }) => {
      const result = await approveLeaveRequest(id, adminNotes);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['currently-on-leave'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-leave'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balance'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balance'] });
      toast.success(t('leave.requestApproved'));
    },
    onError: (error: Error) => {
      toast.error(feedback(error.message));
    },
  });
}

export function useDenyLeaveRequest() {
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ id, adminNotes }: { id: string; adminNotes?: string }) => {
      const result = await denyLeaveRequest(id, adminNotes);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['currently-on-leave'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-leave'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balance'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success(t('leave.requestDenied'));
    },
    onError: (error: Error) => {
      toast.error(feedback(error.message));
    },
  });
}

export function useCancelLeaveRequest() {
  const feedback = useFeedback();
  const tUi = useTranslations('interface');
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await cancelLeaveRequest(id);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['currently-on-leave'] });
      queryClient.invalidateQueries({ queryKey: ['upcoming-leave'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balance'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success(tUi('leaveRequestCancelled'));
    },
    onError: (error: Error) => {
      toast.error(feedback(error.message));
    },
  });
}

function transformLeaveRequest(row: Record<string, unknown>): LeaveRequest {
  // Transform nested user object from snake_case to camelCase
  const rawUser = row.user as { id: string; full_name: string; avatar_url: string | null; email: string } | null;
  const rawReviewer = row.reviewed_by_user as { id: string; full_name: string } | null;

  return {
    id: row.id as string,
    userId: row.user_id as string,
    leaveType: row.leave_type as LeaveRequest['leaveType'],
    status: row.status as 'pending' | 'approved' | 'denied',
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    selectedDates: row.selected_dates as string[] | null,
    isFullDay: row.is_full_day as boolean,
    startTime: row.start_time as string | null,
    endTime: row.end_time as string | null,
    totalDays: parseFloat(row.total_days as string) || 0,
    reason: row.reason as string | null,
    adminNotes: row.admin_notes as string | null,
    reviewedBy: row.reviewed_by as string | null,
    reviewedAt: row.reviewed_at as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    user: rawUser ? {
      id: rawUser.id,
      fullName: rawUser.full_name,
      avatarUrl: rawUser.avatar_url,
      email: rawUser.email,
    } : undefined,
    reviewer: rawReviewer ? {
      id: rawReviewer.id,
      fullName: rawReviewer.full_name,
    } : undefined,
  };
}
