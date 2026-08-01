'use client';

import { cn } from '@/lib/utils';
import { getTagBadgeClasses, getTagDisplayLabel } from '@/lib/menu-tags';

type TagLike = {
  name: string;
  label?: string | null;
  color?: string | null;
};

// Small colored chip for a food tag. Shows the short code (GF, KF, HP...) when
// one exists, with the full name as a tooltip.
export function MenuTagBadge({
  tag,
  size = 'md',
  showName = false,
  className,
}: {
  tag: TagLike;
  size?: 'sm' | 'md';
  showName?: boolean;
  className?: string;
}) {
  return (
    <span
      title={tag.name}
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border font-semibold uppercase tracking-wide',
        size === 'sm' ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-xs',
        getTagBadgeClasses(tag.color),
        className
      )}
    >
      {showName ? tag.name : getTagDisplayLabel(tag)}
    </span>
  );
}
