'use client';

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

type LeaveFilters = {
  status?: 'pending' | 'approved' | 'denied';
  leaveType?: 'pto' | 'sick';
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
        .order('created_at', { ascending: false });

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
        .order('created_at', { ascending: false });

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
        .order('created_at', { ascending: true });

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
            id: null,
            userId,
            year: targetYear,
            ptoTotal: 15,
            ptoUsed: 0,
            sickTotal: 10,
            sickUsed: 0,
            createdAt: null,
            updatedAt: null,
          } as LeaveBalance;
        }
        throw error;
      }

      return {
        id: data.id,
        userId: data.user_id,
        year: data.year,
        ptoTotal: parseFloat(data.pto_total),
        ptoUsed: parseFloat(data.pto_used),
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
      const today = new Date().toISOString().split('T')[0];

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
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('leave_requests')
        .select(`
          *,
          user:users!leave_requests_user_id_fkey(id, full_name, avatar_url, email)
        `)
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today)
        .order('end_date', { ascending: true });

      if (error) throw error;

      return (data || []).map(transformLeaveRequest);
    },
  });
}

export function useCreateLeaveRequest() {
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
      toast.success(t('leave.requestSubmitted'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useApproveLeaveRequest() {
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
      queryClient.invalidateQueries({ queryKey: ['leave-balance'] });
      toast.success(t('leave.requestApproved'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDenyLeaveRequest() {
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
      toast.success(t('leave.requestDenied'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useCancelLeaveRequest() {
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
      toast.success('Leave request cancelled');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

function transformLeaveRequest(row: Record<string, unknown>): LeaveRequest {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    leaveType: row.leave_type as 'pto' | 'sick',
    status: row.status as 'pending' | 'approved' | 'denied',
    startDate: row.start_date as string,
    endDate: row.end_date as string,
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
    user: row.user as { id: string; fullName: string; avatarUrl: string | null; email: string } | undefined,
    reviewedByUser: row.reviewed_by_user as { id: string; fullName: string } | undefined,
  };
}
