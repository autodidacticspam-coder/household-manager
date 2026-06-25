'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { normalizeFoodName } from '@/lib/food-names';
import { toast } from 'sonner';

export type MenuItemMerge = {
  id: string;
  sourceName: string;
  canonicalName: string;
  mergeNote: string | null;
  mergedBy: string | null;
  mergedAt: string;
  unmergedAt: string | null;
  unmergedBy: string | null;
  unmergeNote: string | null;
  createdAt: string;
  updatedAt: string;
  mergedByUser?: {
    id: string;
    fullName: string;
  };
  unmergedByUser?: {
    id: string;
    fullName: string;
  };
};

export type CreateMenuItemMergesInput = {
  canonicalName: string;
  sourceNames: string[];
  note?: string | null;
};

export function useMenuItemMerges(options?: { activeOnly?: boolean }) {
  const supabase = createClient();
  const activeOnly = options?.activeOnly ?? false;

  return useQuery({
    queryKey: ['menu-item-merges', { activeOnly }],
    queryFn: async () => {
      let query = supabase
        .from('menu_item_merges')
        .select(`
          *,
          merged_by_user:users!menu_item_merges_merged_by_fkey(id, full_name),
          unmerged_by_user:users!menu_item_merges_unmerged_by_fkey(id, full_name)
        `)
        .order('merged_at', { ascending: false });

      if (activeOnly) {
        query = query.is('unmerged_at', null);
      }

      const { data, error } = await query;
      if (error) {
        if (isMissingMenuItemMergesTableError(error)) return [];
        throw error;
      }

      return (data || []).map(transformMenuItemMerge);
    },
  });
}

export function useCreateMenuItemMerges() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (input: CreateMenuItemMergesInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const canonicalName = input.canonicalName.trim();
      const sourceNames = input.sourceNames
        .map((sourceName) => sourceName.trim())
        .filter((sourceName) => sourceName)
        .filter((sourceName) => normalizeFoodName(sourceName) !== normalizeFoodName(canonicalName));

      const uniqueSourceNames = Array.from(
        new Map(sourceNames.map((sourceName) => [normalizeFoodName(sourceName), sourceName])).values()
      );

      if (!canonicalName || uniqueSourceNames.length === 0) {
        throw new Error('Choose at least one source dish to merge');
      }

      const { data, error } = await supabase
        .from('menu_item_merges')
        .insert(uniqueSourceNames.map((sourceName) => ({
          source_name: sourceName,
          canonical_name: canonicalName,
          merge_note: input.note || null,
          merged_by: user.id,
        })))
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateFoodMergeQueries(queryClient);
      toast.success('Food items merged');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUndoMenuItemMerge() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string | null }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('menu_item_merges')
        .update({
          unmerged_at: new Date().toISOString(),
          unmerged_by: user.id,
          unmerge_note: note || null,
        })
        .eq('id', id)
        .is('unmerged_at', null);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateFoodMergeQueries(queryClient);
      toast.success('Food item unmerged');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

function invalidateFoodMergeQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['menu-item-merges'] });
  queryClient.invalidateQueries({ queryKey: ['menu-ratings-all'] });
  queryClient.invalidateQueries({ queryKey: ['menu-ratings-summary'] });
  queryClient.invalidateQueries({ queryKey: ['food-requests'] });
}

function isMissingMenuItemMergesTableError(error: { code?: string; message?: string }): boolean {
  const message = error.message?.toLowerCase() || '';

  return error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (message.includes('menu_item_merges') && (
      message.includes('does not exist') ||
      message.includes('could not find') ||
      message.includes('not found')
    ));
}

function getJoinedUser(rawUser: unknown): { id: string; full_name: string } | undefined {
  if (!rawUser) return undefined;
  const user = Array.isArray(rawUser) ? rawUser[0] : rawUser;
  if (!user || typeof user !== 'object') return undefined;
  return user as { id: string; full_name: string };
}

function transformMenuItemMerge(row: Record<string, unknown>): MenuItemMerge {
  const mergedByUser = getJoinedUser(row.merged_by_user);
  const unmergedByUser = getJoinedUser(row.unmerged_by_user);

  return {
    id: row.id as string,
    sourceName: row.source_name as string,
    canonicalName: row.canonical_name as string,
    mergeNote: row.merge_note as string | null,
    mergedBy: row.merged_by as string | null,
    mergedAt: row.merged_at as string,
    unmergedAt: row.unmerged_at as string | null,
    unmergedBy: row.unmerged_by as string | null,
    unmergeNote: row.unmerge_note as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    mergedByUser: mergedByUser ? {
      id: mergedByUser.id,
      fullName: mergedByUser.full_name,
    } : undefined,
    unmergedByUser: unmergedByUser ? {
      id: unmergedByUser.id,
      fullName: unmergedByUser.full_name,
    } : undefined,
  };
}
