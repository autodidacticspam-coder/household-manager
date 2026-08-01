'use client';

import { type ReactNode, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { GroupedTagList } from '@/components/food/grouped-tag-list';
import { useMenuTags, type MenuTag } from '@/hooks/use-menu-tags';

// Popover to edit the tags of a single dish.
export function MenuTagPicker({
  assignedTagIds,
  onToggle,
  isSaving = false,
  trigger,
  align = 'start',
}: {
  assignedTagIds: string[];
  onToggle: (tag: MenuTag, enabled: boolean) => void;
  isSaving?: boolean;
  trigger?: ReactNode;
  align?: 'start' | 'center' | 'end';
}) {
  const t = useTranslations('foodTags');
  const [isOpen, setIsOpen] = useState(false);
  const { data: tags = [], isLoading } = useMenuTags({ enabled: isOpen });
  const assigned = new Set(assignedTagIds);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs">
            <Tag className="h-3.5 w-3.5" />
            {t('editTags')}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align={align} sideOffset={5}>
        <p className="px-2 pb-2 pt-1 text-xs font-medium text-muted-foreground">
          {t('editTags')}
        </p>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <GroupedTagList
            tags={tags}
            isSelected={(tag) => assigned.has(tag.id)}
            onToggle={(tag, enabled) => onToggle(tag, enabled)}
            isSaving={isSaving}
            emptyMessage={t('noTagsYet')}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
