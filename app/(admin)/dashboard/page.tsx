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
import { Users, CheckSquare, Clock, Calendar, Loader2, AlertTriangle, Package } from 'lucide-react';
import { useTeamStats } from '@/hooks/use-reports';
import { usePendingLeaveRequests, useCurrentlyOnLeave } from '@/hooks/use-leave';
import { usePendingTasks, useOverdueTasks } from '@/hooks/use-tasks';
import { useEmployees } from '@/hooks/use-tasks';
import { usePendingSupplyRequests } from '@/hooks/use-supplies';
import { format, subDays } from 'date-fns';
import Link from 'next/link';

type DialogType = 'employees' | 'tasks' | 'leave' | 'onLeave' | 'supplies' | null;

export default function DashboardPage() {
  const t = useTranslations();
  const [openDialog, setOpenDialog] = useState<DialogType>(null);

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
  const { data: employees } = useEmployees();
  const { data: pendingSupplyRequests, isLoading: suppliesLoading } = usePendingSupplyRequests();

  const isLoading = statsLoading || leaveLoading || suppliesLoading;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('nav.dashboard')}</h1>
        <p className="text-muted-foreground">
          {t('descriptions.dashboard')}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {/* Employees Card */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setOpenDialog('employees')}
        >
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

        {/* Tasks Card */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setOpenDialog('tasks')}
        >
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

        {/* Leave Requests Card */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setOpenDialog('leave')}
        >
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

        {/* On Leave Today Card */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setOpenDialog('onLeave')}
        >
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

        {/* Supply Requests Card */}
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setOpenDialog('supplies')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('nav.supplyRequests')}
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : (pendingSupplyRequests?.length ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('leave.awaitingApproval')}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

        {/* Pending Supply Requests Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('nav.supplyRequests')}</CardTitle>
            {(pendingSupplyRequests?.length ?? 0) > 0 && (
              <Link href="/supply-requests">
                <Button variant="outline" size="sm">{t('common.viewAll')}</Button>
              </Link>
            )}
          </CardHeader>
          <CardContent>
            {suppliesLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : pendingSupplyRequests && pendingSupplyRequests.length > 0 ? (
              <div className="space-y-4">
                {pendingSupplyRequests.slice(0, 5).map((request) => (
                  <div key={request.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={request.user?.avatarUrl || ''} />
                        <AvatarFallback>
                          {request.user?.fullName?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{request.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {request.user?.fullName} - {format(new Date(request.createdAt), 'MMM d')}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{t('leave.status.pending')}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t('descriptions.noPendingRequests')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Employees Dialog */}
      <Dialog open={openDialog === 'employees'} onOpenChange={() => setOpenDialog(null)}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {t('reports.stats.totalEmployees')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {employees && employees.length > 0 ? (
              employees.map((emp) => (
                <div key={emp.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={emp.avatar_url || ''} />
                    <AvatarFallback>{emp.full_name?.charAt(0) || '?'}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="font-medium">{emp.full_name}</p>
                    <p className="text-sm text-muted-foreground">{emp.email}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground text-center py-4">{t('common.noResults')}</p>
            )}
            <div className="pt-2">
              <Link href="/employees">
                <Button className="w-full">{t('nav.employees')}</Button>
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                        {t('tasks.dueDate')}: {task.due_date ? format(new Date(task.due_date), 'MMM d') : '-'}
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
                      {task.due_date ? format(new Date(task.due_date), 'MMM d') : t('tasks.noDueDate')}
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
                        {format(new Date(request.startDate), 'MMM d')} - {format(new Date(request.endDate), 'MMM d')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {request.totalDays} {t('common.days')}
                      </p>
                    </div>
                  </div>
                  <Badge variant={request.leaveType === 'pto' ? 'default' : 'secondary'}>
                    {request.leaveType === 'pto' ? t('leave.pto') : t('leave.sick')}
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
            {currentlyOnLeave && currentlyOnLeave.length > 0 ? (
              currentlyOnLeave.map((leave) => (
                <div key={leave.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={leave.user?.avatarUrl || ''} />
                      <AvatarFallback>{leave.user?.fullName?.charAt(0) || '?'}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{leave.user?.fullName}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(leave.startDate), 'MMM d')} - {format(new Date(leave.endDate), 'MMM d')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {leave.totalDays} {t('common.days')}
                      </p>
                    </div>
                  </div>
                  <Badge variant={leave.leaveType === 'pto' ? 'default' : 'secondary'}>
                    {leave.leaveType === 'pto' ? t('leave.pto') : t('leave.sick')}
                  </Badge>
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
    </div>
  );
}
