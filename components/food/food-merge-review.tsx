'use client';

import { useId, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Check, GitMerge, History, Loader2, RotateCcw, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { findPotentialFoodMergeGroups, normalizeFoodName, type FoodNameStats } from '@/lib/food-names';
import type { MenuRating } from '@/hooks/use-menu-ratings';
import {
  useCreateMenuItemMerges,
  useUndoMenuItemMerge,
  type MenuItemMerge,
} from '@/hooks/use-menu-item-merges';
import { cn } from '@/lib/utils';

type FoodMergeReviewProps = {
  ratings: MenuRating[];
  activeMerges: MenuItemMerge[];
  mergeHistory: MenuItemMerge[];
};

export function FoodMergeReview({
  ratings,
  activeMerges,
  mergeHistory,
}: FoodMergeReviewProps) {
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  const [manualSearchTerm, setManualSearchTerm] = useState('');
  const [selectedManualSourceNames, setSelectedManualSourceNames] = useState<string[]>([]);
  const [manualCanonicalName, setManualCanonicalName] = useState('');
  const canonicalDatalistId = useId();
  const createMenuItemMerges = useCreateMenuItemMerges();
  const undoMenuItemMerge = useUndoMenuItemMerge();

  const foodNameStats = useMemo(() => buildFoodNameStats(ratings), [ratings]);
  const foodNameOptions = useMemo(
    () => foodNameStats.map((item) => item.name).sort((a, b) => a.localeCompare(b)),
    [foodNameStats]
  );
  const activeSourceNames = useMemo(
    () => new Set(activeMerges.map((merge) => normalizeFoodName(merge.sourceName))),
    [activeMerges]
  );
  const potentialMergeGroups = useMemo(
    () => findPotentialFoodMergeGroups(foodNameStats, activeMerges),
    [foodNameStats, activeMerges]
  );
  const normalizedManualCanonical = normalizeFoodName(manualCanonicalName);
  const manualSearchMatches = useMemo(
    () => findManualMergeMatches(foodNameStats, manualSearchTerm),
    [foodNameStats, manualSearchTerm]
  );
  const selectedManualSourceSet = useMemo(
    () => new Set(selectedManualSourceNames.map((name) => normalizeFoodName(name))),
    [selectedManualSourceNames]
  );
  const selectedManualStats = useMemo(
    () => selectedManualSourceNames
      .map((name) => foodNameStats.find((item) => normalizeFoodName(item.name) === normalizeFoodName(name)))
      .filter((item): item is FoodNameStats => Boolean(item)),
    [foodNameStats, selectedManualSourceNames]
  );
  const alreadyMergedManualSources = useMemo(
    () => selectedManualSourceNames.filter((name) => activeSourceNames.has(normalizeFoodName(name))),
    [activeSourceNames, selectedManualSourceNames]
  );
  const manualSourceNames = selectedManualSourceNames.filter(
    (sourceName) => normalizeFoodName(sourceName) !== normalizedManualCanonical
  );
  const canCreateManualMerge = Boolean(
    normalizedManualCanonical &&
    manualSourceNames.length > 0 &&
    alreadyMergedManualSources.length === 0 &&
    !createMenuItemMerges.isPending
  );

  const approveMerge = (groupId: string, itemNames: string[], recommendedName: string) => {
    const canonicalName = mergeTargets[groupId] || recommendedName;
    const sourceNames = itemNames.filter(
      (itemName) => normalizeFoodName(itemName) !== normalizeFoodName(canonicalName)
    );

    createMenuItemMerges.mutate({
      canonicalName,
      sourceNames,
      note: 'Approved from food ratings merge review',
    });
  };

  const createManualMerge = () => {
    if (!canCreateManualMerge) return;

    createMenuItemMerges.mutate({
      canonicalName: manualCanonicalName,
      sourceNames: manualSourceNames,
      note: 'Manual merge from food ratings merge review',
    }, {
      onSuccess: () => {
        setManualSearchTerm('');
        setSelectedManualSourceNames([]);
        setManualCanonicalName('');
      },
    });
  };

  const toggleManualSource = (name: string) => {
    const normalizedName = normalizeFoodName(name);

    setSelectedManualSourceNames((current) => {
      const alreadySelected = current.some((item) => normalizeFoodName(item) === normalizedName);

      if (alreadySelected) {
        return current.filter((item) => normalizeFoodName(item) !== normalizedName);
      }

      return [...current, name];
    });

    if (!manualCanonicalName.trim()) {
      setManualCanonicalName(name);
    }
  };

  const selectAllManualMatches = () => {
    const matchNames = manualSearchMatches
      .filter((item) => !activeSourceNames.has(normalizeFoodName(item.name)))
      .map((item) => item.name);

    setSelectedManualSourceNames((current) => {
      const merged = new Map(current.map((name) => [normalizeFoodName(name), name]));
      for (const name of matchNames) {
        merged.set(normalizeFoodName(name), name);
      }
      return Array.from(merged.values());
    });

    if (!manualCanonicalName.trim() && matchNames[0]) {
      setManualCanonicalName(matchNames[0]);
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-lg border bg-background p-4">
        <div className="mb-4 flex items-start gap-3">
          <GitMerge className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">Manual Merge</h3>
            <p className="text-sm text-muted-foreground">
              Merge a rated dish into the exact name that should be used in ratings and request analytics.
            </p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,420px)]">
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="manual-merge-search">Search rated dishes</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="manual-merge-search"
                    value={manualSearchTerm}
                    onChange={(event) => setManualSearchTerm(event.target.value)}
                    placeholder="3 cup chicken"
                    className="pl-10"
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={selectAllManualMatches}
                disabled={manualSearchMatches.length === 0}
              >
                Select matches
              </Button>
            </div>

            <div className="max-h-[320px] overflow-y-auto rounded-lg border">
              {manualSearchTerm.trim() && manualSearchMatches.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No rated dishes match this search.
                </p>
              ) : !manualSearchTerm.trim() ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Type a keyword to find rated dishes.
                </p>
              ) : (
                <div className="divide-y">
                  {manualSearchMatches.map((item) => {
                    const isSelected = selectedManualSourceSet.has(normalizeFoodName(item.name));
                    const isAlreadyMerged = activeSourceNames.has(normalizeFoodName(item.name));

                    return (
                      <div
                        key={item.name}
                        className={cn(
                          "flex items-start gap-3 px-3 py-3 hover:bg-muted/50",
                          isAlreadyMerged && "opacity-60"
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={isAlreadyMerged}
                          onCheckedChange={() => toggleManualSource(item.name)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-tight">{item.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.totalRatings} rating{item.totalRatings !== 1 ? 's' : ''}
                            {typeof item.averageRating === 'number' && ` - ${item.averageRating.toFixed(1)} avg`}
                          </p>
                          {isAlreadyMerged && (
                            <p className="mt-1 text-xs text-amber-600">Already merged</p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isAlreadyMerged}
                          onClick={(event) => {
                            event.preventDefault();
                            setManualCanonicalName(item.name);
                            if (!isSelected) toggleManualSource(item.name);
                          }}
                        >
                          Canonical
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
            <div className="space-y-2">
              <Label htmlFor="manual-merge-canonical">Canonical dish name</Label>
              <Input
                id="manual-merge-canonical"
                list={canonicalDatalistId}
                value={manualCanonicalName}
                onChange={(event) => setManualCanonicalName(event.target.value)}
                placeholder="3 cup chicken"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Selected dishes</Label>
                {selectedManualSourceNames.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedManualSourceNames([])}
                  >
                    Clear
                  </Button>
                )}
              </div>

              {selectedManualStats.length === 0 ? (
                <p className="rounded-lg border bg-background px-3 py-4 text-sm text-muted-foreground">
                  No dishes selected.
                </p>
              ) : (
                <div className="flex max-h-[180px] flex-wrap gap-2 overflow-y-auto rounded-lg border bg-background p-3">
                  {selectedManualStats.map((item) => (
                    <Badge
                      key={item.name}
                      variant={normalizeFoodName(item.name) === normalizedManualCanonical ? 'default' : 'outline'}
                      className="max-w-full gap-1.5"
                    >
                      <span className="truncate">{item.name}</span>
                      <button
                        type="button"
                        className="rounded-full text-muted-foreground hover:text-foreground"
                        onClick={() => toggleManualSource(item.name)}
                        aria-label={`Remove ${item.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <datalist id={canonicalDatalistId}>
              {foodNameOptions.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>

            {alreadyMergedManualSources.length > 0 && (
              <p className="text-sm text-amber-600">
                Unmerge already-merged dishes in the history table before changing their canonical dish.
              </p>
            )}

            <Button
              type="button"
              onClick={createManualMerge}
              disabled={!canCreateManualMerge}
              className="w-full"
            >
              {createMenuItemMerges.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GitMerge className="h-4 w-4" />
              )}
              Merge {manualSourceNames.length || ''}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="mb-4 flex items-start gap-3">
          <GitMerge className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">Potential Food Merges</h3>
            <p className="text-sm text-muted-foreground">
              Review very similar rated dishes before grouping them together in summaries and request analytics.
            </p>
          </div>
        </div>

        {potentialMergeGroups.length === 0 ? (
          <p className="rounded-lg border bg-background px-4 py-6 text-center text-sm text-muted-foreground">
            No likely duplicate dish names found right now.
          </p>
        ) : (
          <div className="space-y-4">
            {potentialMergeGroups.map((group) => {
              const targetName = mergeTargets[group.id] || group.recommendedName;
              const sourceNames = group.items
                .map((item) => item.name)
                .filter((itemName) => normalizeFoodName(itemName) !== normalizeFoodName(targetName));

              return (
                <div key={group.id} className="rounded-lg border bg-background p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{Math.round(group.score * 100)}% match</Badge>
                        <span className="text-xs text-muted-foreground">{group.reason}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {group.items.map((item) => (
                          <Badge key={item.name} variant="outline" className="max-w-full">
                            <span className="truncate">{item.name}</span>
                            <span className="text-muted-foreground">{item.totalRatings} ratings</span>
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
                      <Select
                        value={targetName}
                        onValueChange={(value) => setMergeTargets((current) => ({
                          ...current,
                          [group.id]: value,
                        }))}
                      >
                        <SelectTrigger className="w-full sm:w-64">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {group.items.map((item) => (
                            <SelectItem key={item.name} value={item.name}>
                              {item.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={() => approveMerge(group.id, group.items.map((item) => item.name), group.recommendedName)}
                        disabled={sourceNames.length === 0 || createMenuItemMerges.isPending}
                      >
                        {createMenuItemMerges.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Approve
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Merge History</h3>
        </div>

        {mergeHistory.length === 0 ? (
          <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
            No food item merges have been approved yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Canonical Dish</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Merged By</TableHead>
                <TableHead>Merged</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mergeHistory.map((merge) => {
                const isActive = !merge.unmergedAt;

                return (
                  <TableRow key={merge.id}>
                    <TableCell className="font-medium max-w-[220px] truncate">{merge.sourceName}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{merge.canonicalName}</TableCell>
                    <TableCell>
                      {isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="outline">Unmerged</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {merge.mergedByUser?.fullName || 'Unknown'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(merge.mergedAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      {isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => undoMenuItemMerge.mutate({ id: merge.id })}
                          disabled={undoMenuItemMerge.isPending}
                        >
                          {undoMenuItemMerge.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3 w-3" />
                          )}
                          Unmerge
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

function buildFoodNameStats(ratings: MenuRating[]): FoodNameStats[] {
  const stats = new Map<string, {
    name: string;
    ratings: number[];
    lastRatedAt: string;
  }>();

  for (const rating of ratings) {
    const existing = stats.get(rating.menuItem);

    if (existing) {
      existing.ratings.push(rating.rating);
      if (new Date(rating.createdAt) > new Date(existing.lastRatedAt)) {
        existing.lastRatedAt = rating.createdAt;
      }
    } else {
      stats.set(rating.menuItem, {
        name: rating.menuItem,
        ratings: [rating.rating],
        lastRatedAt: rating.createdAt,
      });
    }
  }

  return Array.from(stats.values()).map((item) => ({
    name: item.name,
    totalRatings: item.ratings.length,
    averageRating: item.ratings.reduce((sum, rating) => sum + rating, 0) / item.ratings.length,
    lastRatedAt: item.lastRatedAt,
  }));
}

function findManualMergeMatches(items: FoodNameStats[], searchTerm: string): FoodNameStats[] {
  const tokens = normalizeFoodName(searchTerm)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) return [];

  return items
    .filter((item) => {
      const normalizedName = normalizeFoodName(item.name);
      return tokens.every((token) => normalizedName.includes(token));
    })
    .sort((a, b) => {
      const normalizedSearch = tokens.join(' ');
      const normalizedA = normalizeFoodName(a.name);
      const normalizedB = normalizeFoodName(b.name);
      const aStarts = normalizedA.startsWith(normalizedSearch) ? 1 : 0;
      const bStarts = normalizedB.startsWith(normalizedSearch) ? 1 : 0;

      if (aStarts !== bStarts) return bStarts - aStarts;
      if (b.totalRatings !== a.totalRatings) return b.totalRatings - a.totalRatings;
      return a.name.localeCompare(b.name);
    });
}
