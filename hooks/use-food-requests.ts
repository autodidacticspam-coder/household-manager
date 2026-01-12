'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

export type FoodRequest = {
  id: string;
  foodName: string;
  requestedBy: string;
  notes: string | null;
  status: 'pending' | 'completed' | 'declined';
  completedAt: string | null;
  completedBy: string | null;
  createdAt: string;
  updatedAt: string;
  requestedByUser?: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
  };
  completedByUser?: {
    id: string;
    fullName: string;
  };
};

export type CreateFoodRequestInput = {
  foodName: string;
  notes?: string | null;
  recipeId?: string | null;
};

// Get all food requests
export function useFoodRequests(filters?: { status?: 'pending' | 'completed' | 'declined' }) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['food-requests', filters],
    queryFn: async () => {
      let query = supabase
        .from('food_requests')
        .select(`
          *,
          requested_by_user:users!food_requests_requested_by_fkey(id, full_name, avatar_url),
          completed_by_user:users!food_requests_completed_by_fkey(id, full_name)
        `)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(transformFoodRequest);
    },
  });
}

// Get pending food requests count
export function usePendingFoodRequestsCount() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['food-requests-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('food_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      if (error) throw error;
      return count || 0;
    },
  });
}

// Create a food request
export function useCreateFoodRequest() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (input: CreateFoodRequestInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('food_requests')
        .insert({
          food_name: input.foodName,
          notes: input.notes || null,
          recipe_id: input.recipeId || null,
          requested_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['food-requests'] });
      queryClient.invalidateQueries({ queryKey: ['food-requests-count'] });
      toast.success('Food request submitted');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Complete a food request
export function useCompleteFoodRequest() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('food_requests')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          completed_by: user.id,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['food-requests'] });
      queryClient.invalidateQueries({ queryKey: ['food-requests-count'] });
      toast.success('Request marked as completed');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Decline a food request
export function useDeclineFoodRequest() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('food_requests')
        .update({ status: 'declined' })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['food-requests'] });
      queryClient.invalidateQueries({ queryKey: ['food-requests-count'] });
      toast.success('Request declined');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Delete a food request
export function useDeleteFoodRequest() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('food_requests')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['food-requests'] });
      queryClient.invalidateQueries({ queryKey: ['food-requests-count'] });
      toast.success('Request deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

function transformFoodRequest(row: Record<string, unknown>): FoodRequest {
  // Handle Supabase join which may return array or object
  const rawRequestedByUser = row.requested_by_user as unknown;
  let requestedByUser: { id: string; full_name: string; avatar_url: string | null } | undefined;

  if (rawRequestedByUser) {
    const userData = Array.isArray(rawRequestedByUser) ? rawRequestedByUser[0] : rawRequestedByUser;
    if (userData && typeof userData === 'object') {
      requestedByUser = userData as { id: string; full_name: string; avatar_url: string | null };
    }
  }

  const rawCompletedByUser = row.completed_by_user as unknown;
  let completedByUser: { id: string; full_name: string } | undefined;

  if (rawCompletedByUser) {
    const userData = Array.isArray(rawCompletedByUser) ? rawCompletedByUser[0] : rawCompletedByUser;
    if (userData && typeof userData === 'object') {
      completedByUser = userData as { id: string; full_name: string };
    }
  }

  return {
    id: row.id as string,
    foodName: row.food_name as string,
    requestedBy: row.requested_by as string,
    notes: row.notes as string | null,
    status: row.status as 'pending' | 'completed' | 'declined',
    completedAt: row.completed_at as string | null,
    completedBy: row.completed_by as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    requestedByUser: requestedByUser ? {
      id: requestedByUser.id,
      fullName: requestedByUser.full_name,
      avatarUrl: requestedByUser.avatar_url,
    } : undefined,
    completedByUser: completedByUser ? {
      id: completedByUser.id,
      fullName: completedByUser.full_name,
    } : undefined,
  };
}
