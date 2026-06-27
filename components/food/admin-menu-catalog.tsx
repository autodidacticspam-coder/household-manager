'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Check, Loader2, Plus, Search, Tags } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CORE_MENU_TAGS,
  type AdminMenuCatalogItem,
  type CoreMenuTagSlug,
  useAdminMenuCatalogItems,
  useCoreMenuTags,
  useCreateAdminMenuCatalogItem,
  useToggleMenuItemTag,
} from '@/hooks/use-admin-menu-catalog';
import { cn } from '@/lib/utils';

type AdminMenuCatalogProps = {
  searchTerm: string;
};

export function AdminMenuCatalog({ searchTerm }: AdminMenuCatalogProps) {
  const [selectedTagSlugs, setSelectedTagSlugs] = useState<CoreMenuTagSlug[]>([]);
  const [showUntaggedOnly, setShowUntaggedOnly] = useState(false);
  const { data: coreTags = [], isLoading: tagsLoading } = useCoreMenuTags();
  const { data: catalogItems = [], isLoading: itemsLoading } = useAdminMenuCatalogItems({
    search: searchTerm,
    tagSlugs: selectedTagSlugs,
  });
  const toggleTag = useToggleMenuItemTag();
  const createItem = useCreateAdminMenuCatalogItem();

  const tagBySlug = useMemo(
    () => new Map(coreTags.map((tag) => [tag.slug, tag])),
    [coreTags]
  );
  const coreSlugSet = useMemo(
    () => new Set(CORE_MENU_TAGS.map((tag) => tag.slug)),
    []
  );
  const visibleItems = useMemo(() => {
    if (!showUntaggedOnly) return catalogItems;

    return catalogItems.filter((item) =>
      !item.tags.some((tag) => coreSlugSet.has(tag.slug as CoreMenuTagSlug))
    );
  }, [catalogItems, coreSlugSet, showUntaggedOnly]);
  const trimmedSearch = searchTerm.trim();
  const canAddSearchedDish = trimmedSearch.length > 1 &&
    selectedTagSlugs.length === 0 &&
    !showUntaggedOnly &&
    !catalogItems.some((item) => item.name.toLowerCase() === trimmedSearch.toLowerCase());

  const toggleFilter = (slug: CoreMenuTagSlug) => {
    setShowUntaggedOnly(false);
    setSelectedTagSlugs((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : [...current, slug]
    );
  };

  const toggleUntaggedFilter = () => {
    setSelectedTagSlugs([]);
    setShowUntaggedOnly((current) => !current);
  };

  if (itemsLoading || tagsLoading) {
    return (
      <Card>
        <CardContent className="flex min-h-[260px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Tags className="h-5 w-5" />
              Menu Catalog
            </CardTitle>
            <CardDescription>
              {visibleItems.length} of {catalogItems.length} dishes shown
            </CardDescription>
          </div>
          {canAddSearchedDish && (
            <Button
              variant="outline"
              onClick={() => createItem.mutate(trimmedSearch)}
              disabled={createItem.isPending}
              className="max-w-full justify-start"
            >
              {createItem.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span className="truncate">Add &quot;{trimmedSearch}&quot;</span>
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {CORE_MENU_TAGS.map((tag) => {
            const selected = selectedTagSlugs.includes(tag.slug);

            return (
              <Button
                key={tag.slug}
                variant={selected ? 'default' : 'outline'}
                size="sm"
                onClick={() => toggleFilter(tag.slug)}
                className={cn(selected && getActiveTagClassName(tag.slug))}
              >
                {selected && <Check className="h-3.5 w-3.5" />}
                {tag.label}
                <span className="hidden sm:inline">{tag.name}</span>
              </Button>
            );
          })}
          <Button
            variant={showUntaggedOnly ? 'default' : 'outline'}
            size="sm"
            onClick={toggleUntaggedFilter}
            className={cn(showUntaggedOnly && 'bg-slate-700 text-white hover:bg-slate-800')}
          >
            {showUntaggedOnly && <Check className="h-3.5 w-3.5" />}
            Untagged
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {visibleItems.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Search className="h-8 w-8" />
            <p>No catalog dishes found</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {visibleItems.map((item) => (
                <CatalogItemCard
                  key={item.id}
                  item={item}
                  tagBySlug={tagBySlug}
                  isSaving={toggleTag.isPending}
                  onToggleTag={(tagId, enabled) => {
                    toggleTag.mutate({ menuItemId: item.id, tagId, enabled });
                  }}
                />
              ))}
            </div>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dish</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead className="text-center">Rating</TableHead>
                    <TableHead className="text-center">Ratings</TableHead>
                    <TableHead className="text-center">Seen</TableHead>
                    <TableHead>Last Seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        <div className="max-w-[360px]">
                          <p className="truncate">{item.name}</p>
                          {item.mealTypes.length > 0 && (
                            <p className="mt-1 text-xs capitalize text-muted-foreground">
                              {item.mealTypes.join(', ')}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <TagToggleGroup
                          item={item}
                          tagBySlug={tagBySlug}
                          isSaving={toggleTag.isPending}
                          onToggleTag={(tagId, enabled) => {
                            toggleTag.mutate({ menuItemId: item.id, tagId, enabled });
                          }}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        {item.averageRating ? (
                          <Badge variant="secondary">{item.averageRating.toFixed(1)}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{item.totalRatings}</TableCell>
                      <TableCell className="text-center">{item.timesServed}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.lastServedAt ? format(new Date(item.lastServedAt), 'MMM d, yyyy') : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CatalogItemCard({
  item,
  tagBySlug,
  isSaving,
  onToggleTag,
}: {
  item: AdminMenuCatalogItem;
  tagBySlug: Map<string, { id: string; name: string; slug: string }>;
  isSaving: boolean;
  onToggleTag: (tagId: string, enabled: boolean) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{item.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.totalRatings} ratings - seen {item.timesServed}
          </p>
        </div>
        {item.averageRating ? (
          <Badge variant="secondary">{item.averageRating.toFixed(1)}</Badge>
        ) : null}
      </div>
      <TagToggleGroup
        item={item}
        tagBySlug={tagBySlug}
        isSaving={isSaving}
        onToggleTag={onToggleTag}
      />
    </div>
  );
}

function TagToggleGroup({
  item,
  tagBySlug,
  isSaving,
  onToggleTag,
}: {
  item: AdminMenuCatalogItem;
  tagBySlug: Map<string, { id: string; name: string; slug: string }>;
  isSaving: boolean;
  onToggleTag: (tagId: string, enabled: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {CORE_MENU_TAGS.map((coreTag) => {
        const tag = tagBySlug.get(coreTag.slug);
        const enabled = item.tags.some((itemTag) => itemTag.slug === coreTag.slug);

        return (
          <Button
            key={coreTag.slug}
            type="button"
            variant={enabled ? 'default' : 'outline'}
            size="sm"
            title={coreTag.name}
            aria-pressed={enabled}
            disabled={!tag || isSaving}
            className={cn(
              'h-8 min-w-11 px-3',
              enabled && getActiveTagClassName(coreTag.slug),
              !enabled && getInactiveTagClassName(coreTag.slug)
            )}
            onClick={() => {
              if (!tag) return;
              onToggleTag(tag.id, !enabled);
            }}
          >
            {enabled && <Check className="h-3.5 w-3.5" />}
            {coreTag.label}
          </Button>
        );
      })}
    </div>
  );
}

function getActiveTagClassName(slug: CoreMenuTagSlug): string {
  if (slug === 'gluten-free') return 'bg-emerald-600 text-white hover:bg-emerald-700';
  if (slug === 'low-carb') return 'bg-sky-600 text-white hover:bg-sky-700';
  return 'bg-amber-500 text-white hover:bg-amber-600';
}

function getInactiveTagClassName(slug: CoreMenuTagSlug): string {
  if (slug === 'gluten-free') return 'border-emerald-200 text-emerald-700 hover:bg-emerald-50';
  if (slug === 'low-carb') return 'border-sky-200 text-sky-700 hover:bg-sky-50';
  return 'border-amber-200 text-amber-700 hover:bg-amber-50';
}
