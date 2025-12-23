'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

// Check if user can access food ratings (admin or chef only)
export function useCanAccessFoodRatings() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['can-access-food-ratings'],
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

      // Check if in Chef group
      const { data: membership } = await supabase
        .from('employee_group_memberships')
        .select(`
          group:employee_groups!inner(name)
        `)
        .eq('user_id', user.id);

      if (membership && membership.length > 0) {
        return membership.some((m) => {
          const group = m.group as { name: string }[] | { name: string } | null;
          if (Array.isArray(group)) {
            return group.some(g => g.name?.toLowerCase() === 'chef');
          }
          return (group as { name?: string } | null)?.name?.toLowerCase() === 'chef';
        });
      }

      return false;
    },
  });
}

export type MenuRating = {
  id: string;
  weekStart: string;
  dayOfWeek: string;
  mealType: string;
  menuItem: string;
  rating: number;
  ratedBy: string;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  ratedByUser?: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
  };
};

export type MenuRatingInput = {
  weekStart: string;
  dayOfWeek: string;
  mealType: string;
  menuItem: string;
  rating: number;
  comment?: string | null;
};

// Get all ratings for a specific week (for admin menu view)
export function useMenuRatings(weekStart: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['menu-ratings', weekStart],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('menu_ratings')
        .select(`
          *,
          rated_by_user:users!menu_ratings_rated_by_fkey(id, full_name, avatar_url)
        `)
        .eq('week_start', weekStart)
        .eq('rated_by', user.id);

      if (error) throw error;

      return (data || []).map(transformRating);
    },
  });
}

// Get all ratings (for chef view) - aggregated across all admins
export function useAllMenuRatings(filters?: {
  menuItem?: string;
  startDate?: string;
  endDate?: string;
}) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['menu-ratings-all', filters],
    queryFn: async () => {
      let query = supabase
        .from('menu_ratings')
        .select(`
          *,
          rated_by_user:users!menu_ratings_rated_by_fkey(id, full_name, avatar_url)
        `)
        .order('created_at', { ascending: false });

      if (filters?.menuItem) {
        query = query.ilike('menu_item', `%${filters.menuItem}%`);
      }

      if (filters?.startDate) {
        query = query.gte('week_start', filters.startDate);
      }

      if (filters?.endDate) {
        query = query.lte('week_start', filters.endDate);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(transformRating);
    },
  });
}

// Get aggregated ratings by menu item (for chef analytics)
export function useMenuRatingsSummary() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['menu-ratings-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_ratings')
        .select(`
          menu_item,
          rating,
          rated_by_user:users!menu_ratings_rated_by_fkey(full_name)
        `);

      if (error) throw error;

      // Aggregate ratings by menu item
      const itemMap = new Map<string, {
        menuItem: string;
        ratings: number[];
        raters: string[];
      }>();

      for (const row of data || []) {
        const item = row.menu_item;
        const existing = itemMap.get(item);
        const ratedByUser = row.rated_by_user as unknown;
        let raterName = 'Unknown';
        if (Array.isArray(ratedByUser) && ratedByUser[0]?.full_name) {
          raterName = ratedByUser[0].full_name;
        } else if (ratedByUser && typeof ratedByUser === 'object' && 'full_name' in ratedByUser) {
          raterName = (ratedByUser as { full_name: string }).full_name;
        }

        if (existing) {
          existing.ratings.push(row.rating);
          if (!existing.raters.includes(raterName)) {
            existing.raters.push(raterName);
          }
        } else {
          itemMap.set(item, {
            menuItem: item,
            ratings: [row.rating],
            raters: [raterName],
          });
        }
      }

      // Calculate averages and format
      return Array.from(itemMap.values())
        .map(item => ({
          menuItem: item.menuItem,
          averageRating: item.ratings.reduce((a, b) => a + b, 0) / item.ratings.length,
          totalRatings: item.ratings.length,
          raters: item.raters,
          minRating: Math.min(...item.ratings),
          maxRating: Math.max(...item.ratings),
        }))
        .sort((a, b) => b.averageRating - a.averageRating);
    },
  });
}

// Create or update a rating
export function useRateMenuItem() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (input: MenuRatingInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Use upsert to handle both create and update
      const { data, error } = await supabase
        .from('menu_ratings')
        .upsert({
          week_start: input.weekStart,
          day_of_week: input.dayOfWeek,
          meal_type: input.mealType,
          menu_item: input.menuItem,
          rating: input.rating,
          rated_by: user.id,
          comment: input.comment || null,
        }, {
          onConflict: 'week_start,day_of_week,meal_type,menu_item,rated_by',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['menu-ratings', variables.weekStart] });
      queryClient.invalidateQueries({ queryKey: ['menu-ratings-all'] });
      queryClient.invalidateQueries({ queryKey: ['menu-ratings-summary'] });
      toast.success('Rating saved');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Delete a rating
export function useDeleteMenuRating() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('menu_ratings')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-ratings'] });
      queryClient.invalidateQueries({ queryKey: ['menu-ratings-all'] });
      queryClient.invalidateQueries({ queryKey: ['menu-ratings-summary'] });
      toast.success('Rating deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

function transformRating(row: Record<string, unknown>): MenuRating {
  // Handle Supabase join which may return array or object
  const rawRatedByUser = row.rated_by_user as unknown;
  let ratedByUser: { id: string; full_name: string; avatar_url: string | null } | null = null;

  if (Array.isArray(rawRatedByUser) && rawRatedByUser[0]) {
    ratedByUser = rawRatedByUser[0];
  } else if (rawRatedByUser && typeof rawRatedByUser === 'object') {
    ratedByUser = rawRatedByUser as { id: string; full_name: string; avatar_url: string | null };
  }

  return {
    id: row.id as string,
    weekStart: row.week_start as string,
    dayOfWeek: row.day_of_week as string,
    mealType: row.meal_type as string,
    menuItem: row.menu_item as string,
    rating: row.rating as number,
    ratedBy: row.rated_by as string,
    comment: row.comment as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    ratedByUser: ratedByUser ? {
      id: ratedByUser.id,
      fullName: ratedByUser.full_name,
      avatarUrl: ratedByUser.avatar_url,
    } : undefined,
  };
}
