'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { requestMenuSwap, respondToMenuSwap, markMenuNotificationRead } from '@/app/(admin)/menu/actions';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { databaseClient } from '@/lib/supabase/database-client';
import type { MenuRequestInput, MenuResponseInput } from '@/lib/validators/menu-requests';
import type { Database } from '@/types/database';

export type MenuChangeRequest = Database['public']['Tables']['menu_change_requests']['Row'] & {
  requester: { full_name: string } | null;
  responder: { full_name: string } | null;
};

export function useMenuRequests(weekStart: string, enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['menu-requests', user?.id, weekStart], enabled: !!user && enabled, refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await databaseClient(createClient()).from('menu_change_requests')
        .select('*, requester:users!menu_change_requests_requested_by_fkey(full_name), responder:users!menu_change_requests_responded_by_fkey(full_name)')
        .eq('week_start', weekStart).order('created_at', { ascending: false });
      if (error) throw error;
      return data as MenuChangeRequest[];
    },
  });
}

export function useMenuRequestMutation() {
  const t = useTranslations('menuRequests');
  const cache = useQueryClient();
  return useMutation({
    mutationFn: async (input: MenuRequestInput | MenuResponseInput) => {
      try {
        const result = 'decision' in input ? await respondToMenuSwap(input) : await requestMenuSwap(input);
        return 'error' in result ? { error: t(result.error) } : result;
      } catch { return { error: t('requestFailed') }; }
    },
    onSuccess: async result => {
      await Promise.all(['menu-requests', 'menu-notifications', 'weekly-menu', 'menu-ratings', 'menu-ratings-all', 'meal-suggestions']
        .map(key => cache.invalidateQueries({ queryKey: [key] })));
      if ('success' in result) {
        if ('status' in result && result.status === 'stale') toast.error(t('staleExplanation'));
        else toast.success(t('status' in result ? 'responseSaved' : 'requestSent'));
      }
    },
  });
}

export function useMenuNotifications(limit = 50) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['menu-notifications', user?.id, 'recent', limit], enabled: !!user, refetchInterval: 15000,
    queryFn: async () => {
      const db = databaseClient(createClient());
      const [recent, unread] = await Promise.all([
        db.from('menu_notifications').select('*, actor:users!menu_notifications_actor_id_fkey(full_name)')
          .eq('recipient_id', user!.id).order('created_at', { ascending: false }).limit(limit),
        db.from('menu_notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', user!.id).is('read_at', null),
      ]);
      if (recent.error || unread.error) throw recent.error || unread.error;
      return { items: recent.data || [], unread: unread.count || 0 };
    },
  });
}

export function useMenuUpdates(weekStart: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['menu-notifications', user?.id, 'week', weekStart], enabled: !!user, refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await databaseClient(createClient()).from('menu_notifications')
        .select('*, actor:users!menu_notifications_actor_id_fkey(full_name)')
        .eq('recipient_id', user!.id).eq('week_start', weekStart).eq('kind', 'menu_updated').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useReadMenuNotification() {
  const cache = useQueryClient();
  const t = useTranslations('menuRequests');
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await markMenuNotificationRead(id);
      if ('error' in result) throw new Error(t(result.error));
    },
    onSuccess: () => cache.invalidateQueries({ queryKey: ['menu-notifications'] }),
    onError: () => toast.error(t('readFailed')),
  });
}
