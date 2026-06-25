'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Check, GitMerge, History, Loader2, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  const createMenuItemMerges = useCreateMenuItemMerges();
  const undoMenuItemMerge = useUndoMenuItemMerge();

  const foodNameStats = useMemo(() => buildFoodNameStats(ratings), [ratings]);
  const potentialMergeGroups = useMemo(
    () => findPotentialFoodMergeGroups(foodNameStats, activeMerges),
    [foodNameStats, activeMerges]
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

  return (
    <div className="space-y-8">
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
