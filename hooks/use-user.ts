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

      const { error } = await supabase
        .from('users')
        .update({
          full_name: data.fullName,
          phone: data.phone,
          avatar_url: data.avatarUrl,
          sms_notifications_enabled: data.smsNotificationsEnabled,
          preferred_locale: data.preferredLocale,
        })
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
