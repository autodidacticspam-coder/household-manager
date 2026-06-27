'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

export const CORE_MENU_TAGS = [
  { slug: 'gluten-free', label: 'GF', name: 'Gluten Free' },
  { slug: 'low-carb', label: 'LC', name: 'Low Carb' },
  { slug: 'kid-friendly', label: 'KF', name: 'Kid Friendly' },
] as const;

export type CoreMenuTagSlug = typeof CORE_MENU_TAGS[number]['slug'];

export type AdminMenuTag = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
};

export type AdminMenuCatalogItem = {
  id: string;
  name: string;
  category: string | null;
  aliases: string[];
  mealTypes: string[];
  timesServed: number;
  lastServedAt: string | null;
  averageRating: number | null;
  totalRatings: number;
  searchText: string | null;
  tags: AdminMenuTag[];
};

export type AdminMenuCatalogFilters = {
  search?: string;
  tagSlugs?: string[];
};

export function useCoreMenuTags() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['admin-menu-catalog-core-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_tags')
        .select('id, name, slug, color')
        .in('slug', CORE_MENU_TAGS.map((tag) => tag.slug));

      if (error) {
        if (isMissingMenuCatalogError(error)) return [];
        throw error;
      }

      const tags = (data || [])
        .map((row) => transformTag(row as Record<string, unknown>))
        .filter((tag): tag is AdminMenuTag => Boolean(tag));
      return CORE_MENU_TAGS
        .map((coreTag) => tags.find((tag) => tag.slug === coreTag.slug))
        .filter((tag): tag is AdminMenuTag => Boolean(tag));
    },
  });
}

export function useAdminMenuCatalogItems(filters?: AdminMenuCatalogFilters) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['admin-menu-catalog-items', filters],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_items')
        .select(`
          id,
          name,
          category,
          aliases,
          meal_types,
          times_served,
          last_served_at,
          average_rating,
          total_ratings,
          search_text,
          menu_item_tags(
            tag:menu_tags(id, name, slug, color)
          )
        `)
        .eq('active', true)
        .order('name', { ascending: true })
        .range(0, 4999);

      if (error) {
        if (isMissingMenuCatalogError(error)) return [];
        throw error;
      }

      const selectedTagSlugs = filters?.tagSlugs || [];
      const search = filters?.search?.trim().toLowerCase() || '';

      return (data || [])
        .map((row) => transformMenuItem(row as Record<string, unknown>))
        .filter((item) => {
          if (selectedTagSlugs.length > 0) {
            const itemTagSlugs = new Set(item.tags.map((tag) => tag.slug));
            if (!selectedTagSlugs.every((slug) => itemTagSlugs.has(slug))) return false;
          }

          if (!search) return true;

          const searchable = [
            item.name,
            item.category || '',
            item.searchText || '',
            ...item.aliases,
            ...item.mealTypes,
            ...item.tags.map((tag) => tag.name),
          ].join(' ').toLowerCase();

          return searchable.includes(search);
        });
    },
  });
}

export function useToggleMenuItemTag() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      menuItemId,
      tagId,
      enabled,
    }: {
      menuItemId: string;
      tagId: string;
      enabled: boolean;
    }) => {
      if (enabled) {
        const { error } = await supabase
          .from('menu_item_tags')
          .upsert(
            { menu_item_id: menuItemId, tag_id: tagId },
            { onConflict: 'menu_item_id,tag_id' }
          );

        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from('menu_item_tags')
        .delete()
        .eq('menu_item_id', menuItemId)
        .eq('tag_id', tagId);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateCatalogQueries(queryClient);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useCreateAdminMenuCatalogItem() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (name: string) => {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error('Dish name is required');

      const { data: { user } } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('menu_items')
        .insert({
          name: trimmedName,
          aliases: [],
          meal_types: [],
          created_by: user?.id || null,
          updated_by: user?.id || null,
        })
        .select(`
          id,
          name,
          category,
          aliases,
          meal_types,
          times_served,
          last_served_at,
          average_rating,
          total_ratings,
          search_text,
          menu_item_tags(
            tag:menu_tags(id, name, slug, color)
          )
        `)
        .single();

      if (error) {
        if (error.code === '23505') throw new Error('That dish is already in the catalog');
        throw error;
      }

      return transformMenuItem(data as Record<string, unknown>);
    },
    onSuccess: () => {
      invalidateCatalogQueries(queryClient);
      toast.success('Dish added');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

function transformMenuItem(row: Record<string, unknown>): AdminMenuCatalogItem {
  const itemTags = Array.isArray(row.menu_item_tags) ? row.menu_item_tags : [];

  return {
    id: row.id as string,
    name: row.name as string,
    category: row.category as string | null,
    aliases: asStringArray(row.aliases),
    mealTypes: asStringArray(row.meal_types),
    timesServed: Number(row.times_served || 0),
    lastServedAt: row.last_served_at as string | null,
    averageRating: row.average_rating === null || row.average_rating === undefined ? null : Number(row.average_rating),
    totalRatings: Number(row.total_ratings || 0),
    searchText: row.search_text as string | null,
    tags: itemTags
      .map((itemTag) => {
        const rawItemTag = itemTag as Record<string, unknown>;
        const rawTag = rawItemTag.tag || rawItemTag.menu_tags;
        return transformTag(getMaybeJoinedObject(rawTag));
      })
      .filter((tag): tag is AdminMenuTag => Boolean(tag)),
  };
}

function transformTag(row?: Record<string, unknown>): AdminMenuTag | undefined {
  if (!row) return undefined;

  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    color: row.color as string | null,
  };
}

function invalidateCatalogQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['admin-menu-catalog-items'] });
  queryClient.invalidateQueries({ queryKey: ['admin-menu-catalog-core-tags'] });
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function getMaybeJoinedObject(value: unknown): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value[0] as Record<string, unknown> | undefined;
  if (typeof value === 'object') return value as Record<string, unknown>;
  return undefined;
}

function isMissingMenuCatalogError(error: { code?: string; message?: string }): boolean {
  const message = error.message?.toLowerCase() || '';

  return error.code === '42P01' ||
    error.code === '42703' ||
    error.code === 'PGRST205' ||
    (message.includes('menu_items') && (
      message.includes('does not exist') ||
      message.includes('could not find') ||
      message.includes('not found')
    )) ||
    (message.includes('menu_tag') && (
      message.includes('does not exist') ||
      message.includes('could not find') ||
      message.includes('not found')
    ));
}
