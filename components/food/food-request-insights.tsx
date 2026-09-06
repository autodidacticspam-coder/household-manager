'use client';
import { useDateFormat } from '@/hooks/use-date-format';

import { useTranslations } from 'next-intl';

import { useMemo } from 'react';
import type { ReactNode } from 'react';

import { BarChart3, Check, Clock, Plus, Repeat2, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { FoodRequest } from '@/hooks/use-food-requests';

type FoodRequestGroup = {
  foodName: string;
  totalRequests: number;
  myRequests: number;
  pendingRequests: number;
  completedRequests: number;
  declinedRequests: number;
  lastRequestedAt: string;
  requesters: string[];
  notes: string[];
};

type FoodRequestInsightsProps = {
  requests: FoodRequest[];
  userId?: string;
  canCreateRequests: boolean;
  onRequestFood: (foodName?: string) => void;
};

export function FoodRequestInsights({
  requests,
  userId,
  canCreateRequests,
  onRequestFood,
}: FoodRequestInsightsProps) {
  const formatDate = useDateFormat();
  const tUi = useTranslations('interface');
  const requestGroups = useMemo(() => buildFoodRequestGroups(requests, userId), [requests, userId]);
  const myRequestGroups = useMemo(
    () => requestGroups.filter((group) => group.myRequests > 0),
    [requestGroups]
  );
  const favoriteGroups = (myRequestGroups.length > 0 ? myRequestGroups : requestGroups).slice(0, 21);

  const stats = useMemo(() => {
    const myRequests = requests.filter((request) => request.requestedBy === userId).length;

    return {
      total: requests.length,
      mine: myRequests,
      pending: requests.filter((request) => request.status === 'pending').length,
      completed: requests.filter((request) => request.status === 'completed').length,
      uniqueDishes: requestGroups.length,
    };
  }, [requests, requestGroups.length, userId]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <RequestStat label={tUi('total_253')} value={stats.total} icon={<BarChart3 className="h-4 w-4" />} />
        <RequestStat label={tUi('mine')} value={stats.mine} icon={<Send className="h-4 w-4" />} />
        <RequestStat label={tUi('pending')} value={stats.pending} icon={<Clock className="h-4 w-4" />} />
        <RequestStat label={tUi('completed')} value={stats.completed} icon={<Check className="h-4 w-4" />} />
        <RequestStat label={tUi('dishes')} value={stats.uniqueDishes} icon={<Repeat2 className="h-4 w-4" />} />
      </div>

      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">{tUi('requestFavorites')}</h3>
            <p className="text-xs text-muted-foreground">
              {tUi('mostRequestedDishesAreGroupedByApprovedMergeNames')} </p>
          </div>
          {canCreateRequests && (
            <Button size="sm" onClick={() => onRequestFood()}>
              <Plus className="h-4 w-4" />
              {tUi('newRequest')} </Button>
          )}
        </div>

        {favoriteGroups.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">{tUi('noFavoritesYet')}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {favoriteGroups.map((group) => (
              <Button
                key={group.foodName}
                variant="outline"
                className="h-auto justify-between gap-3 px-3 py-2"
                onClick={() => onRequestFood(group.foodName)}
                disabled={!canCreateRequests}
              >
                <span className="min-w-0 truncate text-left">{group.foodName}</span>
                <Badge variant="secondary" className="shrink-0">
                  {group.myRequests > 0 ? group.myRequests : group.totalRequests}x
                </Badge>
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">{tUi('requestAnalysis')}</h3>
          <p className="text-xs text-muted-foreground">
            {tUi('dishesAreGroupedByCanonicalFoodNameSoApprovedMerges')} </p>
        </div>

        <div className="md:hidden space-y-3">
          {requestGroups.map((group) => (
            <div key={group.foodName} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{group.foodName}</p>
                  <p className="text-xs text-muted-foreground">
                    {group.totalRequests}  {tUi('total_264')} {group.myRequests}  {tUi('mine_265')} </p>
                </div>
                {canCreateRequests && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onRequestFood(group.foodName)}
                  >
                    <Repeat2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Badge variant="warning">{group.pendingRequests}  {tUi('pending_266')}</Badge>
                <Badge variant="success">{group.completedRequests}  {tUi('done')}</Badge>
                {group.declinedRequests > 0 && <Badge variant="outline">{group.declinedRequests}  {tUi('declined')}</Badge>}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {tUi('lastRequested')} {formatDate(new Date(group.lastRequestedAt), 'MMM d, yyyy')}
              </p>
            </div>
          ))}
        </div>

        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tUi('dish')}</TableHead>
                <TableHead className="text-center">{tUi('total_253')}</TableHead>
                <TableHead className="text-center">{tUi('mine')}</TableHead>
                <TableHead className="text-center">{tUi('pending')}</TableHead>
                <TableHead className="text-center">{tUi('completed')}</TableHead>
                <TableHead>{tUi('lastRequested_270')}</TableHead>
                <TableHead>{tUi('requestedBy')}</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requestGroups.map((group) => (
                <TableRow key={group.foodName}>
                  <TableCell className="font-medium max-w-[240px] truncate">{group.foodName}</TableCell>
                  <TableCell className="text-center">{group.totalRequests}</TableCell>
                  <TableCell className="text-center">{group.myRequests}</TableCell>
                  <TableCell className="text-center">{group.pendingRequests}</TableCell>
                  <TableCell className="text-center">{group.completedRequests}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(new Date(group.lastRequestedAt), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate">
                    {group.requesters.join(', ')}
                  </TableCell>
                  <TableCell>
                    {canCreateRequests && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRequestFood(group.foodName)}
                      >
                        <Repeat2 className="h-3 w-3" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function RequestStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="mb-2 flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-medium">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function buildFoodRequestGroups(requests: FoodRequest[], userId?: string): FoodRequestGroup[] {
  const groups = new Map<string, FoodRequestGroup>();

  for (const request of requests) {
    const key = request.canonicalFoodName || request.foodName;
    const existing = groups.get(key);
    const requesterName = request.requestedByUser?.fullName || 'Unknown';

    if (existing) {
      existing.totalRequests += 1;
      existing.myRequests += request.requestedBy === userId ? 1 : 0;
      existing.pendingRequests += request.status === 'pending' ? 1 : 0;
      existing.completedRequests += request.status === 'completed' ? 1 : 0;
      existing.declinedRequests += request.status === 'declined' ? 1 : 0;
      if (new Date(request.createdAt) > new Date(existing.lastRequestedAt)) {
        existing.lastRequestedAt = request.createdAt;
      }
      if (!existing.requesters.includes(requesterName)) {
        existing.requesters.push(requesterName);
      }
      if (request.notes) {
        existing.notes.push(request.notes);
      }
    } else {
      groups.set(key, {
        foodName: key,
        totalRequests: 1,
        myRequests: request.requestedBy === userId ? 1 : 0,
        pendingRequests: request.status === 'pending' ? 1 : 0,
        completedRequests: request.status === 'completed' ? 1 : 0,
        declinedRequests: request.status === 'declined' ? 1 : 0,
        lastRequestedAt: request.createdAt,
        requesters: [requesterName],
        notes: request.notes ? [request.notes] : [],
      });
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (b.totalRequests !== a.totalRequests) return b.totalRequests - a.totalRequests;
    return new Date(b.lastRequestedAt).getTime() - new Date(a.lastRequestedAt).getTime();
  });
}
