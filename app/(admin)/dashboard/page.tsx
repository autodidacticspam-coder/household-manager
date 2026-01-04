'use client';

import { useState } from 'react';
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
import { CheckSquare, Clock, Calendar, Loader2, AlertTriangle, Package, Gift } from 'lucide-react';
import { usePendingLeaveRequests, useCurrentlyOnLeave } from '@/hooks/use-leave';
import { usePendingTasks, useOverdueTasks } from '@/hooks/use-tasks';
import { usePendingSupplyRequests } from '@/hooks/use-supplies';
import { useUpcomingImportantDates } from '@/hooks/use-employees';
import { LogsTopCard, LogsDialog, useLogsAccess } from '@/components/dashboard/logs-section';
import { format, eachDayOfInterval, addDays, isAfter, isBefore, isEqual } from 'date-fns';
import type { LeaveRequest } from '@/types';
import Link from 'next/link';

type DialogType = 'tasks' | 'leave' | 'onLeave' | 'supplies' | 'logs' | null;

// Helper to parse date string without timezone issues
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Helper to get dates - uses selectedDates if available, otherwise falls back to range
function getRequestDates(request: LeaveRequest): Date[] {
  if (request.selectedDates && request.selectedDates.length > 0) {
    return request.selectedDates.map(d => parseLocalDate(d));
  }
  // Fallback to range for older requests
  return eachDayOfInterval({
    start: parseLocalDate(request.startDate),
    end: parseLocalDate(request.endDate),
  });
}

// Helper to check if a leave request is a holiday
function isHoliday(request: LeaveRequest): boolean {
  return request.leaveType === 'holiday' || request.reason?.startsWith('Holiday:') || false;
}

// Helper to check if leave type is vacation
function isVacation(request: LeaveRequest): boolean {
  return request.leaveType === 'vacation' || request.leaveType === 'pto';
}

// Helper to get leave type display label
function getLeaveTypeLabel(request: LeaveRequest, t: (key: string) => string): string {
  if (isHoliday(request)) {
    return t('leave.holiday');
  }
  return isVacation(request) ? t('leave.pto') : t('leave.sick');
}

// Helper to get badge variant based on leave type
function getLeaveTypeBadgeClass(request: LeaveRequest): string {
  if (isHoliday(request)) {
    return 'bg-amber-100 text-amber-700';
  }
  if (isVacation(request)) {
    return '';  // default variant
  }
  return 'bg-green-100 text-green-700';  // sick
}

// Type for grouped leave by employee
type GroupedLeave = {
  userId: string;
  user: LeaveRequest['user'];
  leaveEntries: LeaveRequest[];
};

// Helper to filter dates within next N days
function filterDatesWithinRange(dates: Date[], daysAhead: number = 14): Date[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = addDays(today, daysAhead);

  return dates.filter(date => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return (isAfter(d, today) || isEqual(d, today)) && (isBefore(d, endDate) || isEqual(d, endDate));
  });
}

// Helper to group leave entries by employee
function groupLeaveByEmployee(leaves: LeaveRequest[] | undefined): GroupedLeave[] {
  if (!leaves || leaves.length === 0) return [];

  const grouped = leaves.reduce((acc, leave) => {
    const userId = leave.userId;
    if (!acc[userId]) {
      acc[userId] = {
        userId,
        user: leave.user,
        leaveEntries: [],
      };
    }
    acc[userId].leaveEntries.push(leave);
    return acc;
  }, {} as Record<string, GroupedLeave>);

  return Object.values(grouped);
}

export default function DashboardPage() {
  const t = useTranslations();
  const [openDialog, setOpenDialog] = useState<DialogType>(null);

  const { data: pendingLeaveRequests, isLoading: leaveLoading } = usePendingLeaveRequests();
  const { data: currentlyOnLeave } = useCurrentlyOnLeave();
  const { data: pendingTasks } = usePendingTasks();
  const { data: overdueTasks } = useOverdueTasks();
  const { data: pendingSupplyRequests, isLoading: suppliesLoading } = usePendingSupplyRequests();
  const { data: upcomingImportantDates } = useUpcomingImportantDates(7);
  const canAccessLogs = useLogsAccess();

  // Group leave entries by employee for proper counting and display
  const groupedCurrentlyOnLeave = groupLeaveByEmployee(currentlyOnLeave);

  const isLoading = leaveLoading || suppliesLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('nav.dashboard')}</h1>
        <p className="text-muted-foreground">
          {t('descriptions.dashboard')}
        </p>
      </div>

      <div className={`grid grid-cols-2 gap-3 ${canAccessLogs ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}>
        {/* Tasks Card */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setOpenDialog('tasks')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium">
              {t('reports.stats.tasksPending')}
            </CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pb-3 px-3">
            <div className="text-xl font-bold">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (pendingTasks?.length ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('reports.stats.tasksOverdue')}: {overdueTasks?.length ?? 0}
            </p>
          </CardContent>
        </Card>

        {/* Leave Requests Card */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setOpenDialog('leave')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium">
              {t('leave.pendingRequests')}
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pb-3 px-3">
            <div className="text-xl font-bold">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (pendingLeaveRequests?.length ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('leave.awaitingApproval')}
            </p>
          </CardContent>
        </Card>

        {/* On Leave Today Card */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setOpenDialog('onLeave')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium">
              {t('reports.stats.onLeaveToday')}
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pb-3 px-3">
            <div className="text-xl font-bold">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : groupedCurrentlyOnLeave.length}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('leave.staffMembers')}
            </p>
          </CardContent>
        </Card>

        {/* Supply Requests Card */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setOpenDialog('supplies')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-3 px-3">
            <CardTitle className="text-xs font-medium">
              {t('nav.supplyRequests')}
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="pb-3 px-3">
            <div className="text-xl font-bold">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (pendingSupplyRequests?.length ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('leave.awaitingApproval')}
            </p>
          </CardContent>
        </Card>

        {/* Child Logs Card */}
        {canAccessLogs && <LogsTopCard onClick={() => setOpenDialog('logs')} />}
      </div>

      {/* Upcoming Important Dates - only show on desktop or when there are dates */}
      {upcomingImportantDates && upcomingImportantDates.length > 0 && (
        <Card className="hidden md:block">
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Gift className="h-5 w-5 text-pink-500" />
              {t('dashboard.upcomingDates')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {upcomingImportantDates.slice(0, 5).map((date, index) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const [, month, day] = date.date.split('-').map(Number);
                let eventDate = new Date(today.getFullYear(), month - 1, day);
                if (eventDate < today) {
                  eventDate = new Date(today.getFullYear() + 1, month - 1, day);
                }
                const diffDays = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                return (
                  <div key={`${date.employeeId}-${date.date}-${index}`} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-pink-100 flex items-center justify-center">
                        <Gift className="h-4 w-4 text-pink-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{date.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {date.employeeName}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="bg-pink-50 text-pink-700 border-pink-200">
                      {diffDays === 0 ? t('common.today') : diffDays === 1 ? t('common.tomorrow') : `${diffDays} ${t('common.days')}`}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tasks Dialog */}
      <Dialog open={openDialog === 'tasks'} onOpenChange={() => setOpenDialog(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5" />
              {t('reports.stats.tasksPending')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {overdueTasks && overdueTasks.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-red-600 flex items-center gap-1 mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  {t('reports.stats.tasksOverdue')} ({overdueTasks.length})
                </h4>
                {overdueTasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="flex items-center justify-between p-2 rounded-lg bg-red-50 mb-2">
                    <div>
                      <p className="font-medium text-sm">{task.title}</p>
                      <p className="text-xs text-red-600">
                        {t('tasks.dueDate')}: {task.due_date ? format(parseLocalDate(task.due_date), 'MMM d') : '-'}
                      </p>
                    </div>
                    <Badge variant="destructive" className="text-xs">
                      {task.priority}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
            {pendingTasks && pendingTasks.length > 0 ? (
              pendingTasks.slice(0, 10).map((task) => (
                <div key={task.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                  <div>
                    <p className="font-medium text-sm">{task.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {task.due_date ? format(parseLocalDate(task.due_date), 'MMM d') : t('tasks.noDueDate')}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {task.priority}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-center py-4">{t('tasks.noTasks')}</p>
            )}
            <div className="pt-2">
              <Link href="/tasks">
                <Button className="w-full">{t('nav.tasks')}</Button>
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pending Leave Dialog */}
      <Dialog open={openDialog === 'leave'} onOpenChange={() => setOpenDialog(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t('leave.pendingRequests')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {pendingLeaveRequests && pendingLeaveRequests.length > 0 ? (
              pendingLeaveRequests.map((request) => (
                <div key={request.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={request.user?.avatarUrl || ''} />
                      <AvatarFallback>{request.user?.fullName?.charAt(0) || '?'}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{request.user?.fullName}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(parseLocalDate(request.startDate), 'MMM d')} - {format(parseLocalDate(request.endDate), 'MMM d')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {request.totalDays} {t('common.days')}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className={getLeaveTypeBadgeClass(request)}>
                    {getLeaveTypeLabel(request, t)}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-center py-4">{t('leave.noRequests')}</p>
            )}
            <div className="pt-2">
              <Link href="/leave-requests">
                <Button className="w-full">{t('nav.leaveRequests')}</Button>
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* On Leave Today Dialog */}
      <Dialog open={openDialog === 'onLeave'} onOpenChange={() => setOpenDialog(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t('reports.stats.onLeaveToday')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {groupedCurrentlyOnLeave.length > 0 ? (
              groupedCurrentlyOnLeave.map((group) => (
                <div key={group.userId} className="p-3 rounded-lg border space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={group.user?.avatarUrl || ''} />
                      <AvatarFallback>{group.user?.fullName?.charAt(0) || '?'}</AvatarFallback>
                    </Avatar>
                    <p className="font-medium">{group.user?.fullName}</p>
                  </div>
                  {group.leaveEntries.map((leave) => {
                    const filteredDates = filterDatesWithinRange(getRequestDates(leave));
                    if (filteredDates.length === 0) return null;
                    return (
                      <div key={leave.id} className="ml-13 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className={getLeaveTypeBadgeClass(leave)}>
                            {getLeaveTypeLabel(leave, t)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {filteredDates.length} {filteredDates.length === 1 ? t('common.day') : t('common.days')}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {filteredDates.map((date, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs font-normal">
                              {format(date, 'EEE, MMM d')}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-center py-4">{t('dashboard.noOneOnLeave')}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Supply Requests Dialog */}
      <Dialog open={openDialog === 'supplies'} onOpenChange={() => setOpenDialog(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {t('nav.supplyRequests')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {pendingSupplyRequests && pendingSupplyRequests.length > 0 ? (
              pendingSupplyRequests.map((request) => (
                <div key={request.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={request.user?.avatarUrl || ''} />
                      <AvatarFallback>{request.user?.fullName?.charAt(0) || '?'}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{request.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {request.user?.fullName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(request.createdAt), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">{t('leave.status.pending')}</Badge>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-center py-4">{t('descriptions.noPendingRequests')}</p>
            )}
            <div className="pt-2">
              <Link href="/supply-requests">
                <Button className="w-full">{t('nav.supplyRequests')}</Button>
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>
{/* Child Logs Dialog */}      <LogsDialog open={openDialog === 'logs'} onClose={() => setOpenDialog(null)} />
    </div>
  );
}
