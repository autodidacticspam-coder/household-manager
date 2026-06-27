'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Loader2, Plus, Search, Tags } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

type CatalogSortField = 'name' | 'tags' | 'averageRating' | 'totalRatings' | 'timesServed' | 'lastServedAt';
type CatalogSortDirection = 'asc' | 'desc';

const CATALOG_SORT_OPTIONS: { field: CatalogSortField; label: string }[] = [
  { field: 'name', label: 'Dish' },
  { field: 'tags', label: 'Tags' },
  { field: 'averageRating', label: 'Rating' },
  { field: 'totalRatings', label: 'Ratings' },
  { field: 'timesServed', label: 'Seen' },
  { field: 'lastServedAt', label: 'Last Seen' },
];

export function AdminMenuCatalog({ searchTerm }: AdminMenuCatalogProps) {
  const [selectedTagSlugs, setSelectedTagSlugs] = useState<CoreMenuTagSlug[]>([]);
  const [showUntaggedOnly, setShowUntaggedOnly] = useState(false);
  const [sortField, setSortField] = useState<CatalogSortField>('name');
  const [sortDirection, setSortDirection] = useState<CatalogSortDirection>('asc');
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
    const filteredItems = showUntaggedOnly
      ? catalogItems.filter((item) =>
        !item.tags.some((tag) => coreSlugSet.has(tag.slug as CoreMenuTagSlug))
      )
      : catalogItems;

    return sortMenuCatalogItems(filteredItems, sortField, sortDirection);
  }, [catalogItems, coreSlugSet, showUntaggedOnly, sortDirection, sortField]);
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

  const changeSort = (field: CatalogSortField) => {
    if (field === sortField) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortField(field);
    setSortDirection(getDefaultSortDirection(field));
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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

          <div className="flex items-center gap-2">
            <Select
              value={sortField}
              onValueChange={(value) => {
                const nextField = value as CatalogSortField;
                setSortField(nextField);
                setSortDirection(getDefaultSortDirection(nextField));
              }}
            >
              <SelectTrigger size="sm" className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATALOG_SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.field} value={option.field}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')}
              aria-label="Toggle catalog sort direction"
            >
              {sortDirection === 'asc' ? (
                <ArrowUp className="h-4 w-4" />
              ) : (
                <ArrowDown className="h-4 w-4" />
              )}
              {sortDirection === 'asc' ? 'Asc' : 'Desc'}
            </Button>
          </div>
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
                    <TableHead>
                      <SortButton
                        field="name"
                        label="Dish"
                        sortField={sortField}
                        sortDirection={sortDirection}
                        onSort={changeSort}
                      />
                    </TableHead>
                    <TableHead>
                      <SortButton
                        field="tags"
                        label="Tags"
                        sortField={sortField}
                        sortDirection={sortDirection}
                        onSort={changeSort}
                      />
                    </TableHead>
                    <TableHead className="text-center">
                      <SortButton
                        field="averageRating"
                        label="Rating"
                        sortField={sortField}
                        sortDirection={sortDirection}
                        onSort={changeSort}
                        className="mx-auto"
                      />
                    </TableHead>
                    <TableHead className="text-center">
                      <SortButton
                        field="totalRatings"
                        label="Ratings"
                        sortField={sortField}
                        sortDirection={sortDirection}
                        onSort={changeSort}
                        className="mx-auto"
                      />
                    </TableHead>
                    <TableHead className="text-center">
                      <SortButton
                        field="timesServed"
                        label="Seen"
                        sortField={sortField}
                        sortDirection={sortDirection}
                        onSort={changeSort}
                        className="mx-auto"
                      />
                    </TableHead>
                    <TableHead>
                      <SortButton
                        field="lastServedAt"
                        label="Last Seen"
                        sortField={sortField}
                        sortDirection={sortDirection}
                        onSort={changeSort}
                      />
                    </TableHead>
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

function SortButton({
  field,
  label,
  sortField,
  sortDirection,
  onSort,
  className,
}: {
  field: CatalogSortField;
  label: string;
  sortField: CatalogSortField;
  sortDirection: CatalogSortDirection;
  onSort: (field: CatalogSortField) => void;
  className?: string;
}) {
  const active = field === sortField;
  const Icon = !active ? ArrowUpDown : sortDirection === 'asc' ? ArrowUp : ArrowDown;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => onSort(field)}
      className={cn("h-8 px-2 font-semibold", active && "text-foreground", className)}
    >
      {label}
      <Icon className={cn("h-3.5 w-3.5", !active && "opacity-50")} />
    </Button>
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

function getDefaultSortDirection(field: CatalogSortField): CatalogSortDirection {
  if (field === 'name' || field === 'tags') return 'asc';
  return 'desc';
}

function sortMenuCatalogItems(
  items: AdminMenuCatalogItem[],
  field: CatalogSortField,
  direction: CatalogSortDirection
): AdminMenuCatalogItem[] {
  return [...items].sort((a, b) => {
    const result = compareCatalogItems(a, b, field, direction);

    if (result !== 0) return result;
    return a.name.localeCompare(b.name);
  });
}

function compareCatalogItems(
  a: AdminMenuCatalogItem,
  b: AdminMenuCatalogItem,
  field: CatalogSortField,
  direction: CatalogSortDirection
): number {
  if (field === 'name') return compareStrings(a.name, b.name, direction);
  if (field === 'tags') return compareStrings(getCoreTagSortValue(a), getCoreTagSortValue(b), direction, true);
  if (field === 'averageRating') return compareNullableNumbers(a.averageRating, b.averageRating, direction);
  if (field === 'totalRatings') return compareNumbers(a.totalRatings, b.totalRatings, direction);
  if (field === 'timesServed') return compareNumbers(a.timesServed, b.timesServed, direction);
  return compareNullableDates(a.lastServedAt, b.lastServedAt, direction);
}

function compareStrings(
  a: string,
  b: string,
  direction: CatalogSortDirection,
  emptyLast = false
): number {
  const aValue = a.trim();
  const bValue = b.trim();

  if (emptyLast) {
    if (!aValue && !bValue) return 0;
    if (!aValue) return 1;
    if (!bValue) return -1;
  }

  const result = aValue.localeCompare(bValue);
  return direction === 'asc' ? result : -result;
}

function compareNumbers(a: number, b: number, direction: CatalogSortDirection): number {
  const result = a - b;
  return direction === 'asc' ? result : -result;
}

function compareNullableNumbers(
  a: number | null,
  b: number | null,
  direction: CatalogSortDirection
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return compareNumbers(a, b, direction);
}

function compareNullableDates(
  a: string | null,
  b: string | null,
  direction: CatalogSortDirection
): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;

  return compareNumbers(new Date(a).getTime(), new Date(b).getTime(), direction);
}

function getCoreTagSortValue(item: AdminMenuCatalogItem): string {
  const itemTagSlugs = new Set(item.tags.map((tag) => tag.slug));

  return CORE_MENU_TAGS
    .filter((tag) => itemTagSlugs.has(tag.slug))
    .map((tag) => tag.label)
    .join(' ');
}
