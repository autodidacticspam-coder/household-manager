'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, CheckSquare, Clock, Calendar, Loader2 } from 'lucide-react';
import { useTeamStats } from '@/hooks/use-reports';
import { usePendingLeaveRequests, useCurrentlyOnLeave } from '@/hooks/use-leave';
import { usePendingTasks, useOverdueTasks } from '@/hooks/use-tasks';
import { format, subDays } from 'date-fns';
import Link from 'next/link';

export default function DashboardPage() {
  const t = useTranslations();

  // Get stats for last 30 days
  const dateRange = {
    startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
  };

  const { data: teamStats, isLoading: statsLoading } = useTeamStats(dateRange);
  const { data: pendingLeaveRequests, isLoading: leaveLoading } = usePendingLeaveRequests();
  const { data: currentlyOnLeave } = useCurrentlyOnLeave();
  const { data: pendingTasks } = usePendingTasks();
  const { data: overdueTasks } = useOverdueTasks();

  const isLoading = statsLoading || leaveLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('nav.dashboard')}</h1>
        <p className="text-muted-foreground">
          {t('descriptions.dashboard')}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('reports.stats.totalEmployees')}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (teamStats?.totalEmployees ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('reports.stats.activeToday')}: {teamStats?.activeToday ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('reports.stats.tasksPending')}
            </CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (pendingTasks?.length ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('reports.stats.tasksOverdue')}: {overdueTasks?.length ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('leave.pendingRequests')}
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (pendingLeaveRequests?.length ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('leave.awaitingApproval')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('reports.stats.onLeaveToday')}
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (currentlyOnLeave?.length ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('leave.staffMembers')}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('leave.pendingRequests')}</CardTitle>
            {(pendingLeaveRequests?.length ?? 0) > 0 && (
              <Link href="/leave-requests">
                <Button variant="outline" size="sm">{t('common.viewAll')}</Button>
              </Link>
            )}
          </CardHeader>
          <CardContent>
            {leaveLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : pendingLeaveRequests && pendingLeaveRequests.length > 0 ? (
              <div className="space-y-4">
                {pendingLeaveRequests.slice(0, 5).map((request) => (
                  <div key={request.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={request.user?.avatarUrl || ''} />
                        <AvatarFallback>
                          {request.user?.fullName?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{request.user?.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(request.startDate), 'MMM d')} - {format(new Date(request.endDate), 'MMM d')}
                        </p>
                      </div>
                    </div>
                    <Badge variant={request.leaveType === 'pto' ? 'default' : 'secondary'}>
                      {request.leaveType === 'pto' ? t('leave.pto') : t('leave.sick')}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t('leave.noRequests')}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('reports.stats.onLeaveToday')}</CardTitle>
          </CardHeader>
          <CardContent>
            {currentlyOnLeave && currentlyOnLeave.length > 0 ? (
              <div className="space-y-4">
                {currentlyOnLeave.slice(0, 5).map((leave) => (
                  <div key={leave.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={leave.user?.avatarUrl || ''} />
                        <AvatarFallback>
                          {leave.user?.fullName?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{leave.user?.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          {t('common.until')} {format(new Date(leave.endDate), 'MMM d')}
                        </p>
                      </div>
                    </div>
                    <Badge variant={leave.leaveType === 'pto' ? 'default' : 'secondary'}>
                      {leave.leaveType === 'pto' ? t('leave.pto') : t('leave.sick')}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t('dashboard.noOneOnLeave')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
