'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { respondToFoodNote } from '@/app/(admin)/menu/actions';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { databaseClient } from '@/lib/supabase/database-client';
import type { FoodNoteResponseInput } from '@/lib/validators/food-note-response';

export function useCanRespondToFoodNotes() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['can-respond-to-food-notes', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await databaseClient(createClient()).rpc('can_respond_to_food_notes');
      if (error) throw error;
      return data === true;
    },
  });
}

export function useRespondToFoodNote() {
  const t = useTranslations('foodNoteResponses');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: FoodNoteResponseInput) => {
      try {
        const result = await respondToFoodNote(input);
        return 'error' in result ? { error: t(result.error) } : result;
      } catch {
        return { error: t('saveResponseFailed') };
      }
    },
    onSuccess: async (result, input) => {
      // Refresh conflicts as well so a chef can respond to the latest wording.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['food-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['menu-ratings'] }),
        queryClient.invalidateQueries({ queryKey: ['menu-ratings-all'] }),
      ]);
      if ('success' in result) toast.success(t(input.reply === null ? 'markedReceived' : 'replySent'));
    },
  });
}
