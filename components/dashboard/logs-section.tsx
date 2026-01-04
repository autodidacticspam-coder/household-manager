'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ClipboardList, Moon, Utensils, Droplets, Bath, Loader2 } from 'lucide-react';
import { useRecentChildLogs, useCanAccessChildLogs } from '@/hooks/use-child-logs';
import { format } from 'date-fns';
import { formatTime12h } from '@/lib/format-time';
import { getTodayString, parseLocalDate } from '@/lib/date-utils';
import type { ChildLogCategory } from '@/types';
import Link from 'next/link';

// Helper to get category icon
function getCategoryIcon(category: ChildLogCategory) {
  switch (category) {
    case 'sleep':
      return <Moon className="h-4 w-4" />;
    case 'food':
      return <Utensils className="h-4 w-4" />;
    case 'poop':
      return <Droplets className="h-4 w-4" />;
    case 'shower':
      return <Bath className="h-4 w-4" />;
    default:
      return <ClipboardList className="h-4 w-4" />;
  }
}

// Helper to get category color
function getCategoryColor(category: ChildLogCategory): string {
  switch (category) {
    case 'sleep':
      return 'bg-indigo-100 text-indigo-700';
    case 'food':
      return 'bg-orange-100 text-orange-700';
    case 'poop':
      return 'bg-amber-100 text-amber-700';
    case 'shower':
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

// Helper to get child color
function getChildColor(child: string): string {
  switch (child.toLowerCase()) {
    case 'zoe':
      return 'bg-pink-100 text-pink-700';
    case 'zara':
      return 'bg-purple-100 text-purple-700';
    case 'zander':
      return 'bg-cyan-100 text-cyan-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

type LogsSectionProps = {
  openDialog: boolean;
  onOpenDialog: () => void;
  onCloseDialog: () => void;
};

export function LogsTopCard({ onClick }: { onClick: () => void }) {
  const t = useTranslations();
  const { data: canAccessLogs } = useCanAccessChildLogs();
  const { data: recentLogs, isLoading } = useRecentChildLogs(10);

  const today = useMemo(() => getTodayString(), []);

  if (!canAccessLogs) return null;

  const todaysLogs = recentLogs?.filter(log => log.logDate === today) || [];

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          {t('nav.log')}
        </CardTitle>
        <ClipboardList className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : todaysLogs.length}
        </div>
        <p className="text-xs text-muted-foreground">
          {t('common.today')}
        </p>
      </CardContent>
    </Card>
  );
}

export function LogsBottomCard({ onClick }: { onClick: () => void }) {
  const t = useTranslations();
  const { data: canAccessLogs } = useCanAccessChildLogs();
  const { data: recentLogs, isLoading } = useRecentChildLogs(10);

  if (!canAccessLogs) return null;

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-indigo-500" />
          {t('nav.log')}
        </CardTitle>
        {(recentLogs?.length ?? 0) > 0 && (
          <Link href="/logs" onClick={(e) => e.stopPropagation()}>
            <Button variant="outline" size="sm">{t('common.viewAll')}</Button>
          </Link>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : recentLogs && recentLogs.length > 0 ? (
          <div className="space-y-3">
            {recentLogs.slice(0, 5).map((log) => (
              <div key={log.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center ${getCategoryColor(log.category)}`}>
                    {getCategoryIcon(log.category)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={`text-xs ${getChildColor(log.child)}`}>
                        {log.child}
                      </Badge>
                      <span className="text-sm font-medium capitalize">{log.category}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(parseLocalDate(log.logDate), 'MMM d')} at {formatTime12h(log.logTime)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t('childLogs.noLogs')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function LogsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations();
  const { data: recentLogs } = useRecentChildLogs(10);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            {t('nav.log')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {recentLogs && recentLogs.length > 0 ? (
            recentLogs.map((log) => (
              <div key={log.id} className="p-3 rounded-lg border space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={getChildColor(log.child)}>
                      {log.child}
                    </Badge>
                    <Badge variant="secondary" className={getCategoryColor(log.category)}>
                      <span className="flex items-center gap-1">
                        {getCategoryIcon(log.category)}
                        <span className="capitalize">{log.category}</span>
                      </span>
                    </Badge>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  {format(parseLocalDate(log.logDate), 'EEE, MMM d')} at {formatTime12h(log.logTime)}
                  {log.category === 'sleep' && (
                    log.startTime && log.endTime ? (
                      <span className="ml-2">({formatTime12h(log.startTime)} - {formatTime12h(log.endTime)})</span>
                    ) : log.startTime && !log.endTime ? (
                      <span className="ml-2">(Put to bed {formatTime12h(log.startTime)})</span>
                    ) : log.endTime && !log.startTime ? (
                      <span className="ml-2">(Woke up {formatTime12h(log.endTime)})</span>
                    ) : null
                  )}
                </div>
                {log.description && (
                  <p className="text-sm">{log.description}</p>
                )}
                {log.loggedByUser && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={log.loggedByUser.avatarUrl || ''} />
                      <AvatarFallback>{log.loggedByUser.fullName?.charAt(0) || '?'}</AvatarFallback>
                    </Avatar>
                    <span>{log.loggedByUser.fullName}</span>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-center py-4">{t('childLogs.noLogs')}</p>
          )}
          <div className="pt-2">
            <Link href="/logs">
              <Button className="w-full">{t('nav.log')}</Button>
            </Link>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useLogsAccess() {
  const { data: canAccessLogs } = useCanAccessChildLogs();
  return canAccessLogs;
}
