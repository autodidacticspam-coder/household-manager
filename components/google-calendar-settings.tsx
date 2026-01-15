'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  useGoogleCalendarStatus,
  useGoogleCalendarConnect,
  useGoogleCalendarDisconnect,
  useGoogleCalendarFilters,
  useGoogleCalendarSync,
  type SyncFilters,
} from '@/hooks/use-google-calendar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Calendar,
  CheckSquare,
  Clock,
  Briefcase,
  Gift,
  Moon,
  Utensils,
  Baby,
  ShowerHead,
  Loader2,
  RefreshCw,
  Unlink,
} from 'lucide-react';

export function GoogleCalendarSettings() {
  const t = useTranslations();
  const searchParams = useSearchParams();

  const { data: status, isLoading, refetch } = useGoogleCalendarStatus();
  const connect = useGoogleCalendarConnect();
  const disconnect = useGoogleCalendarDisconnect();
  const updateFilters = useGoogleCalendarFilters();
  const sync = useGoogleCalendarSync();

  // Handle OAuth callback messages
  useEffect(() => {
    const connected = searchParams.get('gcal_connected');
    const error = searchParams.get('gcal_error');

    if (connected === 'true') {
      toast.success(t('settings.googleCalendarConnected'));
      // Clean up URL
      window.history.replaceState({}, '', '/settings');
      refetch();
    } else if (error) {
      toast.error(t('settings.googleCalendarConnectError'));
      window.history.replaceState({}, '', '/settings');
    }
  }, [searchParams, t, refetch]);

  const handleFilterChange = (key: keyof SyncFilters | string, value: boolean) => {
    if (!status?.filters) return;

    let newFilters: SyncFilters;

    // Handle nested childLogs filters
    if (key.startsWith('childLogs.')) {
      const childLogKey = key.replace('childLogs.', '') as keyof SyncFilters['childLogs'];
      newFilters = {
        ...status.filters,
        childLogs: {
          ...status.filters.childLogs,
          [childLogKey]: value,
        },
      };
    } else {
      newFilters = {
        ...status.filters,
        [key]: value,
      };
    }

    updateFilters.mutate(newFilters, {
      onSuccess: () => {
        toast.success(t('settings.filtersSaved'));
      },
      onError: () => {
        toast.error(t('settings.filtersError'));
      },
    });
  };

  const handleConnect = () => {
    connect.mutate();
  };

  const handleDisconnect = () => {
    disconnect.mutate(undefined, {
      onSuccess: () => {
        toast.success(t('settings.googleCalendarDisconnected'));
      },
      onError: () => {
        toast.error(t('settings.disconnectError'));
      },
    });
  };

  const handleSync = () => {
    sync.mutate(undefined, {
      onSuccess: () => {
        toast.success(t('settings.syncComplete'));
      },
      onError: () => {
        toast.error(t('settings.syncError'));
      },
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-48" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          {t('settings.googleCalendar')}
        </CardTitle>
        <CardDescription>
          {t('settings.googleCalendarDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Connection Status */}
        {!status?.connected ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('settings.googleCalendarNotConnected')}
            </p>
            <Button onClick={handleConnect} disabled={connect.isPending}>
              {connect.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Calendar className="h-4 w-4 mr-2" />
              )}
              {t('settings.connectGoogleCalendar')}
            </Button>
          </div>
        ) : (
          <>
            {/* Connected Status */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-green-100 text-green-700">
                  {t('settings.connected')}
                </Badge>
                {status.email && (
                  <span className="text-sm text-muted-foreground">
                    {status.email}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={sync.isPending}
                >
                  {sync.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {t('settings.syncNow')}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Unlink className="h-4 w-4 mr-2" />
                      {t('settings.disconnect')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('settings.disconnectTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('settings.disconnectDescription')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDisconnect}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {disconnect.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : null}
                        {t('settings.disconnect')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {/* Sync Filters */}
            <div className="border-t pt-6">
              <h4 className="text-sm font-medium mb-4">{t('settings.syncFilters')}</h4>
              <div className="space-y-4">
                {/* Tasks */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sync-tasks"
                    checked={status.filters.tasks}
                    onCheckedChange={(checked) => handleFilterChange('tasks', !!checked)}
                    disabled={updateFilters.isPending}
                  />
                  <Label htmlFor="sync-tasks" className="flex items-center cursor-pointer">
                    <CheckSquare className="h-4 w-4 mr-2 text-indigo-500" />
                    {t('calendar.showTasks')}
                  </Label>
                </div>

                {/* Leave */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sync-leave"
                    checked={status.filters.leave}
                    onCheckedChange={(checked) => handleFilterChange('leave', !!checked)}
                    disabled={updateFilters.isPending}
                  />
                  <Label htmlFor="sync-leave" className="flex items-center cursor-pointer">
                    <Clock className="h-4 w-4 mr-2 text-blue-500" />
                    {t('calendar.showLeave')}
                  </Label>
                </div>

                {/* Schedules */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sync-schedules"
                    checked={status.filters.schedules}
                    onCheckedChange={(checked) => handleFilterChange('schedules', !!checked)}
                    disabled={updateFilters.isPending}
                  />
                  <Label htmlFor="sync-schedules" className="flex items-center cursor-pointer">
                    <Briefcase className="h-4 w-4 mr-2 text-violet-500" />
                    {t('calendar.showSchedules')}
                  </Label>
                </div>

                {/* Important Dates */}
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sync-important-dates"
                    checked={status.filters.importantDates}
                    onCheckedChange={(checked) => handleFilterChange('importantDates', !!checked)}
                    disabled={updateFilters.isPending}
                  />
                  <Label htmlFor="sync-important-dates" className="flex items-center cursor-pointer">
                    <Gift className="h-4 w-4 mr-2 text-pink-500" />
                    {t('calendar.showImportantDates')}
                  </Label>
                </div>

                {/* Child Logs Section */}
                <div className="border-t pt-4 mt-4">
                  <p className="text-xs font-medium text-muted-foreground mb-3">
                    {t('childLogs.title')}
                  </p>
                  <div className="space-y-3 ml-2">
                    {/* Sleep */}
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="sync-sleep"
                        checked={status.filters.childLogs.sleep}
                        onCheckedChange={(checked) => handleFilterChange('childLogs.sleep', !!checked)}
                        disabled={updateFilters.isPending}
                      />
                      <Label htmlFor="sync-sleep" className="flex items-center cursor-pointer">
                        <Moon className="h-4 w-4 mr-2 text-indigo-500" />
                        {t('childLogs.categories.sleep')}
                      </Label>
                    </div>

                    {/* Food */}
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="sync-food"
                        checked={status.filters.childLogs.food}
                        onCheckedChange={(checked) => handleFilterChange('childLogs.food', !!checked)}
                        disabled={updateFilters.isPending}
                      />
                      <Label htmlFor="sync-food" className="flex items-center cursor-pointer">
                        <Utensils className="h-4 w-4 mr-2 text-orange-500" />
                        {t('childLogs.categories.food')}
                      </Label>
                    </div>

                    {/* Poop */}
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="sync-poop"
                        checked={status.filters.childLogs.poop}
                        onCheckedChange={(checked) => handleFilterChange('childLogs.poop', !!checked)}
                        disabled={updateFilters.isPending}
                      />
                      <Label htmlFor="sync-poop" className="flex items-center cursor-pointer">
                        <Baby className="h-4 w-4 mr-2 text-amber-500" />
                        {t('childLogs.categories.poop')}
                      </Label>
                    </div>

                    {/* Shower */}
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="sync-shower"
                        checked={status.filters.childLogs.shower}
                        onCheckedChange={(checked) => handleFilterChange('childLogs.shower', !!checked)}
                        disabled={updateFilters.isPending}
                      />
                      <Label htmlFor="sync-shower" className="flex items-center cursor-pointer">
                        <ShowerHead className="h-4 w-4 mr-2 text-cyan-500" />
                        {t('childLogs.categories.shower')}
                      </Label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
