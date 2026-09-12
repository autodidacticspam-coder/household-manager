'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { swapMenuMeals } from '@/app/(admin)/menu/actions';
import type { MenuSlot } from '@/lib/validators/menu-swap';

export type SwapMenuMealsVariables = {
  from: MenuSlot;
  to: MenuSlot;
  expectedUpdatedAt: string | null;
  undo?: boolean;
};

export type SwapMenuMealsResult = { success: true; updatedAt: string | null } | { error: string };

// "Tuesday Lunch" in the household's language, for titles, buttons, and toasts.
export function useMenuSlotLabel() {
  const t = useTranslations('menuSwap');
  const tMenu = useTranslations('menu');
  return (slot: MenuSlot) => t('slot', {
    day: tMenu(`days.${slot.day.toLowerCase()}`),
    meal: tMenu(`meals.${slot.mealType}`),
  });
}

export function useSwapMenuMeals(weekStart: string) {
  const t = useTranslations('menuSwap');
  const label = useMenuSlotLabel();
  const queryClient = useQueryClient();

  const mutation = useMutation<SwapMenuMealsResult, Error, SwapMenuMealsVariables>({
    mutationFn: async ({ from, to, expectedUpdatedAt }) => {
      try {
        const result = await swapMenuMeals({ weekStart, from, to, expectedUpdatedAt });
        return 'error' in result ? { error: t(result.error) } : result;
      } catch {
        return { error: t('swapFailed') };
      }
    },
    onSuccess: async (result, variables) => {
      // Refresh after conflicts too, so the chef sees the menu that actually changed.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['weekly-menu', weekStart] }),
        queryClient.invalidateQueries({ queryKey: ['menu-ratings'] }),
        queryClient.invalidateQueries({ queryKey: ['menu-ratings-all'] }),
        queryClient.invalidateQueries({ queryKey: ['meal-suggestions'] }),
      ]);
      if ('error' in result) {
        if (variables.undo) toast.error(result.error);
        return;
      }
      if (variables.undo) {
        toast.success(t('undone'));
        return;
      }
      toast.success(t('swapped', { from: label(variables.from), to: label(variables.to) }), {
        duration: 8000,
        action: {
          label: t('undo'),
          onClick: () => mutation.mutate({ from: variables.to, to: variables.from, expectedUpdatedAt: result.updatedAt, undo: true }),
        },
      });
    },
  });

  return mutation;
}
