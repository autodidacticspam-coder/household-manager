'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Loader2, Plus, Search, Settings2, Tags } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { ManageMenuTagsDialog } from '@/components/food/manage-menu-tags-dialog';
import { MenuTagBadge } from '@/components/food/menu-tag-badge';
import { MenuTagFilter } from '@/components/food/menu-tag-filter';
import { MenuTagPicker } from '@/components/food/menu-tag-picker';
import {
  type AdminMenuCatalogItem,
  useAdminMenuCatalogItems,
  useCreateAdminMenuCatalogItem,
  useToggleMenuItemTag,
} from '@/hooks/use-admin-menu-catalog';
import { useMenuTags } from '@/hooks/use-menu-tags';
import { cn } from '@/lib/utils';

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

export function AdminMenuCatalog() {
  const t = useTranslations('foodTags');
  const [catalogSearchTerm, setCatalogSearchTerm] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showUntaggedOnly, setShowUntaggedOnly] = useState(false);
  const [showManageTags, setShowManageTags] = useState(false);
  const [sortField, setSortField] = useState<CatalogSortField>('name');
  const [sortDirection, setSortDirection] = useState<CatalogSortDirection>('asc');
  const { data: allTags = [], isLoading: tagsLoading } = useMenuTags();
  const { data: catalogItems = [], isLoading: itemsLoading } = useAdminMenuCatalogItems();
  const toggleTag = useToggleMenuItemTag();
  const createItem = useCreateAdminMenuCatalogItem();

  // Stable display order for badges: group order first, then name.
  const tagOrder = useMemo(
    () => new Map(allTags.map((tag, index) => [tag.id, index])),
    [allTags]
  );

  const effectiveCatalogSearchTerm = catalogSearchTerm.trim();
  const visibleItems = useMemo(() => {
    let items = catalogItems;

    if (selectedTagIds.length > 0) {
      items = items.filter((item) => {
        const itemTagIds = new Set(item.tags.map((tag) => tag.id));
        return selectedTagIds.every((tagId) => itemTagIds.has(tagId));
      });
    }

    if (showUntaggedOnly) {
      items = items.filter((item) => item.tags.length === 0);
    }

    if (effectiveCatalogSearchTerm) {
      items = items.filter((item) => matchesCatalogSearch(item, effectiveCatalogSearchTerm));
    }

    return sortMenuCatalogItems(items, sortField, sortDirection, tagOrder);
  }, [catalogItems, effectiveCatalogSearchTerm, selectedTagIds, showUntaggedOnly, sortDirection, sortField, tagOrder]);

  const trimmedSearch = effectiveCatalogSearchTerm;
  const canAddSearchedDish = trimmedSearch.length > 1 &&
    selectedTagIds.length === 0 &&
    !showUntaggedOnly &&
    !catalogItems.some((item) => item.name.toLowerCase() === trimmedSearch.toLowerCase());

  const changeSort = (field: CatalogSortField) => {
    if (field === sortField) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
      return;
    }

    setSortField(field);
    setSortDirection(getDefaultSortDirection(field));
  };

  const handleToggleTag = (item: AdminMenuCatalogItem, tagId: string, enabled: boolean) => {
    toggleTag.mutate({ menuItemId: item.id, tagId, enabled });
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
          <div className="flex flex-wrap gap-2">
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
            <Button variant="outline" onClick={() => setShowManageTags(true)}>
              <Settings2 className="h-4 w-4" />
              {t('manageTags')}
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={catalogSearchTerm}
            onChange={(event) => setCatalogSearchTerm(event.target.value)}
            placeholder="Search catalog..."
            className="pl-10"
          />
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <MenuTagFilter
              selectedTagIds={selectedTagIds}
              onChange={(tagIds) => {
                setShowUntaggedOnly(false);
                setSelectedTagIds(tagIds);
              }}
            />
            <Button
              variant={showUntaggedOnly ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setSelectedTagIds([]);
                setShowUntaggedOnly((current) => !current);
              }}
              className={cn(showUntaggedOnly && 'bg-slate-700 text-white hover:bg-slate-800')}
            >
              {showUntaggedOnly && <Check className="h-3.5 w-3.5" />}
              {t('untagged')}
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
                  tagOrder={tagOrder}
                  isSaving={toggleTag.isPending}
                  onToggleTag={(tagId, enabled) => handleToggleTag(item, tagId, enabled)}
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
                        <ItemTagEditor
                          item={item}
                          tagOrder={tagOrder}
                          isSaving={toggleTag.isPending}
                          onToggleTag={(tagId, enabled) => handleToggleTag(item, tagId, enabled)}
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

      <ManageMenuTagsDialog open={showManageTags} onOpenChange={setShowManageTags} />
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
  tagOrder,
  isSaving,
  onToggleTag,
}: {
  item: AdminMenuCatalogItem;
  tagOrder: Map<string, number>;
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
      <ItemTagEditor
        item={item}
        tagOrder={tagOrder}
        isSaving={isSaving}
        onToggleTag={onToggleTag}
      />
    </div>
  );
}

function ItemTagEditor({
  item,
  tagOrder,
  isSaving,
  onToggleTag,
}: {
  item: AdminMenuCatalogItem;
  tagOrder: Map<string, number>;
  isSaving: boolean;
  onToggleTag: (tagId: string, enabled: boolean) => void;
}) {
  const sortedTags = sortItemTags(item.tags, tagOrder);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sortedTags.map((tag) => (
        <MenuTagBadge key={tag.id} tag={tag} />
      ))}
      <MenuTagPicker
        assignedTagIds={item.tags.map((tag) => tag.id)}
        isSaving={isSaving}
        onToggle={(tag, enabled) => onToggleTag(tag.id, enabled)}
        trigger={
          <Button
            variant="outline"
            size="sm"
            aria-label="Edit tags"
            className="h-6 w-7 border-dashed p-0 text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        }
      />
    </div>
  );
}

function sortItemTags<T extends { id: string }>(tags: T[], tagOrder: Map<string, number>): T[] {
  return [...tags].sort((a, b) => (tagOrder.get(a.id) ?? 999) - (tagOrder.get(b.id) ?? 999));
}

function getDefaultSortDirection(field: CatalogSortField): CatalogSortDirection {
  if (field === 'name' || field === 'tags') return 'asc';
  return 'desc';
}

function sortMenuCatalogItems(
  items: AdminMenuCatalogItem[],
  field: CatalogSortField,
  direction: CatalogSortDirection,
  tagOrder: Map<string, number>
): AdminMenuCatalogItem[] {
  return [...items].sort((a, b) => {
    const result = compareCatalogItems(a, b, field, direction, tagOrder);

    if (result !== 0) return result;
    return a.name.localeCompare(b.name);
  });
}

function compareCatalogItems(
  a: AdminMenuCatalogItem,
  b: AdminMenuCatalogItem,
  field: CatalogSortField,
  direction: CatalogSortDirection,
  tagOrder: Map<string, number>
): number {
  if (field === 'name') return compareStrings(a.name, b.name, direction);
  if (field === 'tags') return compareStrings(getTagSortValue(a, tagOrder), getTagSortValue(b, tagOrder), direction, true);
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

function getTagSortValue(item: AdminMenuCatalogItem, tagOrder: Map<string, number>): string {
  return sortItemTags(item.tags, tagOrder)
    .map((tag) => tag.label || tag.name)
    .join(' ');
}

function matchesCatalogSearch(item: AdminMenuCatalogItem, searchTerm: string): boolean {
  const tokens = searchTerm
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) return true;

  const searchable = [
    item.name,
    item.category || '',
    item.searchText || '',
    ...item.aliases,
    ...item.mealTypes,
    ...item.tags.map((tag) => tag.name),
    ...item.tags.map((tag) => tag.label || ''),
  ].join(' ').toLowerCase();

  return tokens.every((token) => searchable.includes(token));
}
