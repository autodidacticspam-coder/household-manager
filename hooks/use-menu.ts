'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { WeeklyMenu, DayMeals, UpdateMenuInput } from '@/types';
import { toast } from 'sonner';
import { startOfWeek, format } from 'date-fns';

function transformMenu(row: Record<string, unknown>): WeeklyMenu {
  return {
    id: row.id as string,
    weekStart: row.week_start as string,
    meals: row.meals as DayMeals[],
    notes: row.notes as string | null,
    updatedBy: row.updated_by as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    updatedByUser: row.updated_by_user as { id: string; fullName: string } | null,
  };
}

function getDefaultMenu(weekStart: string): WeeklyMenu {
  return {
    id: '',
    weekStart,
    meals: [
      { day: 'Monday', breakfast: '', lunch: '', dinner: '', snacks: '' },
      { day: 'Tuesday', breakfast: '', lunch: '', dinner: '', snacks: '' },
      { day: 'Wednesday', breakfast: '', lunch: '', dinner: '', snacks: '' },
      { day: 'Thursday', breakfast: '', lunch: '', dinner: '', snacks: '' },
      { day: 'Friday', breakfast: '', lunch: '', dinner: '', snacks: '' },
      { day: 'Saturday', breakfast: '', lunch: '', dinner: '', snacks: '' },
      { day: 'Sunday', breakfast: '', lunch: '', dinner: '', snacks: '' },
    ] as DayMeals[],
    notes: null,
    updatedBy: null,
    createdAt: '',
    updatedAt: '',
    updatedByUser: null,
  };
}

export function useWeeklyMenu(weekStart: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['weekly-menu', weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_menu')
        .select(`
          *,
          updated_by_user:users!weekly_menu_updated_by_fkey(id, full_name)
        `)
        .eq('week_start', weekStart)
        .single();

      if (error) {
        // If no menu exists for this week, return a default empty menu
        if (error.code === 'PGRST116') {
          return getDefaultMenu(weekStart);
        }
        throw error;
      }

      return transformMenu(data);
    },
  });
}

// Keep for backwards compatibility
export function useCurrentWeekMenu() {
  const currentWeekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  return useWeeklyMenu(currentWeekStart);
}

export function useUpdateMenu(weekStart: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateMenuInput) => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upsert the menu for the specified week
      const { data, error } = await supabase
        .from('weekly_menu')
        .upsert({
          week_start: weekStart,
          meals: input.meals,
          notes: input.notes || null,
          updated_by: user.id,
        }, {
          onConflict: 'week_start',
        })
        .select()
        .single();

      if (error) throw error;
      return transformMenu(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-menu'] });
      toast.success('Menu updated successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Check if user can edit menu (admin or in Chef group)
export function useCanEditMenu() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['can-edit-menu'],
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

      if (membership) {
        return membership.some((m: any) =>
          m.group?.name?.toLowerCase() === 'chef'
        );
      }

      return false;
    },
  });
}
