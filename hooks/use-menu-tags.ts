'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { normalizeMenuItemName, slugifyTagName } from '@/lib/menu-tags';

export type MenuTagGroup = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
};

export type MenuTag = {
  id: string;
  name: string;
  slug: string;
  label: string | null;
  color: string | null;
  description: string | null;
  group: MenuTagGroup | null;
};

export type TaggableMenuItem = {
  id: string;
  name: string;
  normalizedName: string;
  tagIds: string[];
};

export function useMenuTagGroups() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['menu-tag-groups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_tag_groups')
        .select('id, name, slug, sort_order')
        .order('sort_order', { ascending: true });

      if (error) throw error;

      return (data || []).map((row): MenuTagGroup => ({
        id: row.id as string,
        name: row.name as string,
        slug: row.slug as string,
        sortOrder: Number(row.sort_order || 0),
      }));
    },
  });
}

export function useMenuTags(options?: { enabled?: boolean }) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['menu-tags'],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_tags')
        .select('id, name, slug, label, color, description, group:menu_tag_groups(id, name, slug, sort_order)');

      if (error) throw error;

      const tags = (data || []).map((row) => transformMenuTag(row as Record<string, unknown>));

      return tags.sort((a, b) => {
        const groupOrder = (a.group?.sortOrder ?? 999) - (b.group?.sortOrder ?? 999);
        if (groupOrder !== 0) return groupOrder;
        return a.name.localeCompare(b.name);
      });
    },
  });
}

// How many dishes each tag is applied to, keyed by tag id.
export function useMenuTagUsage(options?: { enabled?: boolean }) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['menu-tag-usage'],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_item_tags')
        .select('tag_id')
        .range(0, 19999);

      if (error) throw error;

      const usage: Record<string, number> = {};
      for (const row of data || []) {
        const tagId = row.tag_id as string;
        usage[tagId] = (usage[tagId] || 0) + 1;
      }
      return usage;
    },
  });
}

// Active catalog dishes with their tag ids, used to look up tags for a dish name.
export function useTaggableMenuItems(options?: { enabled?: boolean }) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['taggable-menu-items'],
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_items')
        .select('id, name, normalized_name, menu_item_tags(tag_id)')
        .eq('active', true)
        .range(0, 9999);

      if (error) throw error;

      return (data || []).map((row): TaggableMenuItem => {
        const itemTags = Array.isArray(row.menu_item_tags) ? row.menu_item_tags : [];
        return {
          id: row.id as string,
          name: row.name as string,
          normalizedName: (row.normalized_name as string | null) || normalizeMenuItemName(row.name as string),
          tagIds: itemTags
            .map((itemTag) => (itemTag as { tag_id?: string }).tag_id)
            .filter((tagId): tagId is string => Boolean(tagId)),
        };
      });
    },
  });
}

export function buildDishTagLookup(items: TaggableMenuItem[] | undefined): Map<string, TaggableMenuItem> {
  const lookup = new Map<string, TaggableMenuItem>();
  for (const item of items || []) {
    lookup.set(item.normalizedName, item);
  }
  return lookup;
}

export type MenuTagInput = {
  name: string;
  label?: string | null;
  color?: string | null;
  groupId: string;
};

export function useCreateMenuTag() {
  const t = useTranslations('foodTags');
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (input: MenuTagInput) => {
      const name = input.name.trim();
      if (!name) throw new Error(t('tagNameRequired'));

      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('menu_tags')
        .insert({
          group_id: input.groupId,
          name,
          slug: slugifyTagName(name),
          label: input.label?.trim().toUpperCase() || null,
          color: input.color || null,
          created_by: user?.id || null,
        });

      if (error) {
        if (error.code === '23505') throw new Error(t('tagExists'));
        throw error;
      }
    },
    onSuccess: () => {
      invalidateTagQueries(queryClient);
      toast.success(t('tagCreated'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateMenuTag() {
  const t = useTranslations('foodTags');
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (input: MenuTagInput & { id: string }) => {
      const name = input.name.trim();
      if (!name) throw new Error(t('tagNameRequired'));

      const { error } = await supabase
        .from('menu_tags')
        .update({
          group_id: input.groupId,
          name,
          label: input.label?.trim().toUpperCase() || null,
          color: input.color || null,
        })
        .eq('id', input.id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateTagQueries(queryClient);
      toast.success(t('tagUpdated'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteMenuTag() {
  const t = useTranslations('foodTags');
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('menu_tags')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateTagQueries(queryClient);
      toast.success(t('tagDeleted'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Adds or removes a tag for a dish identified by name. Creates the catalog
// record on the fly when the dish (e.g. a fresh weekly-menu line) is not in
// the catalog yet.
export function useSetDishTag() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      dishName,
      menuItemId,
      tagId,
      enabled,
    }: {
      dishName: string;
      menuItemId?: string | null;
      tagId: string;
      enabled: boolean;
    }) => {
      let itemId = menuItemId || null;

      if (!itemId) {
        const normalized = normalizeMenuItemName(dishName);
        const { data: existing, error: lookupError } = await supabase
          .from('menu_items')
          .select('id')
          .eq('normalized_name', normalized)
          .eq('active', true)
          .limit(1)
          .maybeSingle();

        if (lookupError) throw lookupError;
        itemId = (existing?.id as string | undefined) || null;
      }

      if (!itemId) {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: created, error: createError } = await supabase
          .from('menu_items')
          .insert({
            name: dishName.trim(),
            aliases: [],
            meal_types: [],
            created_by: user?.id || null,
            updated_by: user?.id || null,
          })
          .select('id')
          .single();

        if (createError) {
          if (createError.code === '23505') {
            // Name already exists (e.g. an inactive/merged record); reuse it.
            const { data: fallback, error: fallbackError } = await supabase
              .from('menu_items')
              .select('id')
              .eq('name', dishName.trim())
              .limit(1)
              .maybeSingle();

            if (fallbackError) throw fallbackError;
            itemId = (fallback?.id as string | undefined) || null;
          } else {
            throw createError;
          }
        } else {
          itemId = created.id as string;
        }
      }

      if (!itemId) throw new Error('Could not find or create this dish in the catalog');

      if (enabled) {
        const { error } = await supabase
          .from('menu_item_tags')
          .upsert(
            { menu_item_id: itemId, tag_id: tagId },
            { onConflict: 'menu_item_id,tag_id' }
          );

        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from('menu_item_tags')
        .delete()
        .eq('menu_item_id', itemId)
        .eq('tag_id', tagId);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateTagQueries(queryClient);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

function invalidateTagQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['menu-tags'] });
  queryClient.invalidateQueries({ queryKey: ['menu-tag-groups'] });
  queryClient.invalidateQueries({ queryKey: ['menu-tag-usage'] });
  queryClient.invalidateQueries({ queryKey: ['taggable-menu-items'] });
  queryClient.invalidateQueries({ queryKey: ['admin-menu-catalog-items'] });
  queryClient.invalidateQueries({ queryKey: ['admin-menu-catalog-core-tags'] });
}

function transformMenuTag(row: Record<string, unknown>): MenuTag {
  const rawGroup = row.group;
  let group: MenuTagGroup | null = null;

  const groupRow = Array.isArray(rawGroup) ? rawGroup[0] : rawGroup;
  if (groupRow && typeof groupRow === 'object') {
    const g = groupRow as Record<string, unknown>;
    group = {
      id: g.id as string,
      name: g.name as string,
      slug: g.slug as string,
      sortOrder: Number(g.sort_order || 0),
    };
  }

  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    label: (row.label as string | null) || null,
    color: (row.color as string | null) || null,
    description: (row.description as string | null) || null,
    group,
  };
}
