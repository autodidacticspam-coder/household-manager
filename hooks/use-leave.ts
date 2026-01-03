'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { LeaveRequest, LeaveBalance } from '@/types';
import type { CreateLeaveRequestInput } from '@/lib/validators/leave';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

type LeaveFilters = {
  status?: 'pending' | 'approved' | 'denied';
  leaveType?: 'vacation' | 'sick';
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
            vacationTotal: 15,
            vacationUsed: 0,
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
        vacationTotal: parseFloat(data.vacation_total),
        vacationUsed: parseFloat(data.vacation_used),
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

      // First, find users who are currently on leave (today falls within their date range)
      const { data: currentLeave, error: currentError } = await supabase
        .from('leave_requests')
        .select('user_id')
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today);

      if (currentError) throw currentError;

      // Get unique user IDs who are currently on leave
      const userIds = [...new Set((currentLeave || []).map(l => l.user_id))];

      if (userIds.length === 0) {
        return [];
      }

      // Fetch ALL approved leave entries for these users (to show holidays too)
      const { data, error } = await supabase
        .from('leave_requests')
        .select(`
          *,
          user:users!leave_requests_user_id_fkey(id, full_name, avatar_url, email)
        `)
        .eq('status', 'approved')
        .in('user_id', userIds)
        .order('start_date', { ascending: true });

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
      const response = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to create leave request');
      }
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
      const response = await fetch(`/api/leave-requests/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNotes }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to approve leave request');
      }
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
      const response = await fetch(`/api/leave-requests/${id}/deny`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminNotes }),
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to deny leave request');
      }
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
      const response = await fetch(`/api/leave-requests/${id}/cancel`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to cancel leave request');
      }
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
  // Transform nested user object from snake_case to camelCase
  const rawUser = row.user as { id: string; full_name: string; avatar_url: string | null; email: string } | null;
  const rawReviewer = row.reviewed_by_user as { id: string; full_name: string } | null;

  return {
    id: row.id as string,
    userId: row.user_id as string,
    leaveType: row.leave_type as 'vacation' | 'sick',
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
