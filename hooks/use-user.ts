'use client';

import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AuthUser } from '@/types';

type UpdateUserData = {
  fullName?: string;
  phone?: string;
  avatarUrl?: string;
  smsNotificationsEnabled?: boolean;
  preferredLocale?: 'en' | 'es' | 'zh';
};

export function useUser() {
  const { user, isLoading, isAdmin, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const supabase = createClient();

  const updateUser = useMutation({
    mutationFn: async (data: UpdateUserData) => {
      if (!user) throw new Error('Not authenticated');

      // Only include fields that are actually provided (not undefined)
      const updateData: Record<string, unknown> = {};
      if (data.fullName !== undefined) updateData.full_name = data.fullName;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.avatarUrl !== undefined) updateData.avatar_url = data.avatarUrl;
      if (data.smsNotificationsEnabled !== undefined) updateData.sms_notifications_enabled = data.smsNotificationsEnabled;
      if (data.preferredLocale !== undefined) updateData.preferred_locale = data.preferredLocale;

      // Don't make a request if there's nothing to update
      if (Object.keys(updateData).length === 0) return;

      const { error } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', user.id);

      if (error) throw error;

      await refreshUser();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });

  return {
    user,
    isLoading,
    isAdmin,
    updateUser: updateUser.mutate,
    isUpdating: updateUser.isPending,
    updateError: updateUser.error,
  };
}

export function useCurrentUser(): AuthUser | null {
  const { user } = useAuth();
  return user;
}

export function useIsAdmin(): boolean {
  const { isAdmin } = useAuth();
  return isAdmin;
}
