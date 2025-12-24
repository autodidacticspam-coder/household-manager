'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { SupplyRequest } from '@/types';
import {
  createSupplyRequest,
  cancelSupplyRequest,
  approveSupplyRequest,
  rejectSupplyRequest,
} from '@/app/(employee)/supplies/actions';
import { toast } from 'sonner';

type SupplyFilters = {
  status?: 'pending' | 'approved' | 'rejected';
};

function transformSupplyRequest(row: Record<string, unknown>): SupplyRequest {
  // Handle Supabase join which may return array or object with snake_case fields
  const rawUser = row.user as unknown;
  let user: { id: string; fullName: string; email: string; avatarUrl: string | null } | undefined;

  if (rawUser) {
    const userData = Array.isArray(rawUser) ? rawUser[0] : rawUser;
    if (userData && typeof userData === 'object') {
      const u = userData as { id: string; full_name: string; email: string; avatar_url: string | null };
      user = {
        id: u.id,
        fullName: u.full_name,
        email: u.email,
        avatarUrl: u.avatar_url,
      };
    }
  }

  const rawReviewer = row.reviewed_by_user as unknown;
  let reviewedByUser: { id: string; fullName: string } | undefined;

  if (rawReviewer) {
    const reviewerData = Array.isArray(rawReviewer) ? rawReviewer[0] : rawReviewer;
    if (reviewerData && typeof reviewerData === 'object') {
      const r = reviewerData as { id: string; full_name: string };
      reviewedByUser = {
        id: r.id,
        fullName: r.full_name,
      };
    }
  }

  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    description: row.description as string | null,
    productUrl: row.product_url as string | null,
    status: row.status as 'pending' | 'approved' | 'rejected',
    reviewedBy: row.reviewed_by as string | null,
    reviewedAt: row.reviewed_at as string | null,
    adminNotes: row.admin_notes as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    user,
    reviewedByUser,
  };
}

export function useSupplyRequests(filters?: SupplyFilters) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['supply-requests', filters],
    queryFn: async () => {
      let query = supabase
        .from('supply_requests')
        .select(`
          *,
          user:users!supply_requests_user_id_fkey(id, full_name, email, avatar_url),
          reviewed_by_user:users!supply_requests_reviewed_by_fkey(id, full_name)
        `)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(transformSupplyRequest);
    },
  });
}

export function useMySupplyRequests(userId?: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['my-supply-requests', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('supply_requests')
        .select(`
          *,
          user:users!supply_requests_user_id_fkey(id, full_name, email, avatar_url),
          reviewed_by_user:users!supply_requests_reviewed_by_fkey(id, full_name)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(transformSupplyRequest);
    },
    enabled: !!userId,
  });
}

export function usePendingSupplyRequests() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['pending-supply-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supply_requests')
        .select(`
          *,
          user:users!supply_requests_user_id_fkey(id, full_name, email, avatar_url)
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data || []).map(transformSupplyRequest);
    },
  });
}

export function useCreateSupplyRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { title: string; description?: string; productUrl?: string }) => {
      const result = await createSupplyRequest(input);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-supply-requests'] });
      queryClient.invalidateQueries({ queryKey: ['supply-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-supply-requests'] });
      toast.success('Supply request submitted');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useCancelSupplyRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await cancelSupplyRequest(id);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-supply-requests'] });
      queryClient.invalidateQueries({ queryKey: ['supply-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-supply-requests'] });
      toast.success('Supply request cancelled');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useApproveSupplyRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, adminNotes }: { id: string; adminNotes?: string }) => {
      const result = await approveSupplyRequest(id, adminNotes);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supply-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-supply-requests'] });
      toast.success('Supply request approved');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useRejectSupplyRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, adminNotes }: { id: string; adminNotes?: string }) => {
      const result = await rejectSupplyRequest(id, adminNotes);
      if (result.error) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supply-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-supply-requests'] });
      toast.success('Supply request rejected');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
