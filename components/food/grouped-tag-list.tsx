'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTagDotClasses } from '@/lib/menu-tags';
import type { MenuTag } from '@/hooks/use-menu-tags';

const KNOWN_GROUP_SLUGS = new Set(['dietary', 'audience', 'protein', 'cuisine', 'prep', 'custom']);

export function useLocalizedTagGroupName() {
  const t = useTranslations('foodTags');

  return (group: { name: string; slug: string } | null) => {
    if (!group) return t('groups.other');
    if (KNOWN_GROUP_SLUGS.has(group.slug)) return t(`groups.${group.slug}`);
    return group.name;
  };
}

export type MenuTagGroupSection = {
  key: string;
  name: string;
  slug: string | null;
  tags: MenuTag[];
};

export function useGroupedMenuTags(tags: MenuTag[]): MenuTagGroupSection[] {
  const localizeGroupName = useLocalizedTagGroupName();

  return useMemo(() => {
    const sections = new Map<string, MenuTagGroupSection>();

    for (const tag of tags) {
      const key = tag.group?.id || 'other';
      let section = sections.get(key);
      if (!section) {
        section = {
          key,
          name: localizeGroupName(tag.group),
          slug: tag.group?.slug || null,
          tags: [],
        };
        sections.set(key, section);
      }
      section.tags.push(tag);
    }

    return Array.from(sections.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags]);
}

// Scrollable list of tags grouped by category, with a toggle per tag. Shared by
// the per-dish tag picker and the tag filter.
export function GroupedTagList({
  tags,
  isSelected,
  onToggle,
  isSaving = false,
  emptyMessage,
}: {
  tags: MenuTag[];
  isSelected: (tag: MenuTag) => boolean;
  onToggle: (tag: MenuTag, selected: boolean) => void;
  isSaving?: boolean;
  emptyMessage?: string;
}) {
  const sections = useGroupedMenuTags(tags);

  if (sections.length === 0) {
    return (
      <p className="px-2 py-4 text-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="max-h-72 space-y-3 overflow-y-auto overscroll-contain pr-1">
      {sections.map((section) => (
        <div key={section.key}>
          <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {section.name}
          </p>
          <div className="space-y-0.5">
            {section.tags.map((tag) => {
              const selected = isSelected(tag);

              return (
                <button
                  key={tag.id}
                  type="button"
                  disabled={isSaving}
                  onClick={() => onToggle(tag, !selected)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors touch-manipulation',
                    'hover:bg-muted disabled:opacity-60',
                    selected && 'bg-muted/70 font-medium'
                  )}
                >
                  <span className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-full', getTagDotClasses(tag.color))} />
                  <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                  {tag.label && (
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                      {tag.label}
                    </span>
                  )}
                  <span className="flex h-4 w-4 items-center justify-center">
                    {isSaving && selected ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : selected ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
