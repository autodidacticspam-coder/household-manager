'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ListFilter, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { GroupedTagList } from '@/components/food/grouped-tag-list';
import { MenuTagBadge } from '@/components/food/menu-tag-badge';
import { useMenuTags } from '@/hooks/use-menu-tags';

// Multi-select tag filter: a popover with all tags plus removable chips for the
// current selection. Dishes must match every selected tag.
export function MenuTagFilter({
  selectedTagIds,
  onChange,
  className,
}: {
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  className?: string;
}) {
  const t = useTranslations('foodTags');
  const [isOpen, setIsOpen] = useState(false);
  const { data: tags = [] } = useMenuTags();

  const selectedTags = useMemo(
    () => tags.filter((tag) => selectedTagIds.includes(tag.id)),
    [tags, selectedTagIds]
  );

  const toggleTag = (tagId: string, enabled: boolean) => {
    onChange(
      enabled
        ? [...selectedTagIds, tagId]
        : selectedTagIds.filter((id) => id !== tagId)
    );
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ListFilter className="h-4 w-4" />
              {t('filterTags')}
              {selectedTagIds.length > 0 && (
                <Badge variant="secondary" className="h-5 min-w-5 px-1 text-xs">
                  {selectedTagIds.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start" sideOffset={5}>
            <div className="flex items-center justify-between px-2 pb-2 pt-1">
              <p className="text-xs font-medium text-muted-foreground">{t('filterTags')}</p>
              {selectedTagIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                >
                  {t('clearTags')}
                </button>
              )}
            </div>
            <GroupedTagList
              tags={tags}
              isSelected={(tag) => selectedTagIds.includes(tag.id)}
              onToggle={(tag, enabled) => toggleTag(tag.id, enabled)}
              emptyMessage={t('noTagsYet')}
            />
          </PopoverContent>
        </Popover>

        {selectedTags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            onClick={() => toggleTag(tag.id, false)}
            className="group inline-flex items-center gap-1"
            title={t('removeFilter', { name: tag.name })}
          >
            <MenuTagBadge tag={tag} showName className="group-hover:opacity-70" />
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}
