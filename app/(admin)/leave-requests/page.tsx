'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useLeaveRequests,
  usePendingLeaveRequests,
  useApproveLeaveRequest,
  useDenyLeaveRequest,
  useCurrentlyOnLeave,
  useUpcomingLeave,
} from '@/hooks/use-leave';
import { format } from 'date-fns';
import { Calendar, CheckCircle, XCircle, Users, Clock } from 'lucide-react';
import type { LeaveRequest } from '@/types';

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  denied: 'bg-red-100 text-red-700',
};

export default function LeaveRequestsPage() {
  const t = useTranslations();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionRequest, setActionRequest] = useState<{ request: LeaveRequest; action: 'approve' | 'deny' } | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');

  const { data: allRequests, isLoading: allLoading } = useLeaveRequests(
    statusFilter !== 'all' ? { status: statusFilter as 'pending' | 'approved' | 'denied' } : undefined
  );
  const { data: pendingRequests, isLoading: pendingLoading } = usePendingLeaveRequests();
  const { data: currentlyOnLeave } = useCurrentlyOnLeave();
  const { data: upcomingLeave } = useUpcomingLeave();

  const approveRequest = useApproveLeaveRequest();
  const denyRequest = useDenyLeaveRequest();

  const handleAction = async () => {
    if (!actionRequest) return;

    if (actionRequest.action === 'approve') {
      await approveRequest.mutateAsync({ id: actionRequest.request.id, adminNotes });
    } else {
      await denyRequest.mutateAsync({ id: actionRequest.request.id, adminNotes });
    }

    setActionRequest(null);
    setAdminNotes('');
  };

  const renderRequestCard = (request: LeaveRequest, showActions = false) => (
    <Card
      key={request.id}
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => setSelectedRequest(request)}
    >
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={(request.user as { avatarUrl: string | null })?.avatarUrl || undefined} />
              <AvatarFallback>
                {(request.user as { fullName: string })?.fullName?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-1">
              <p className="font-medium">{(request.user as { fullName: string })?.fullName}</p>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {request.leaveType === 'pto' ? t('leave.pto') : t('leave.sick')}
                </Badge>
                <Badge className={statusColors[request.status]}>
                  {t(`leave.status.${request.status}`)}
                </Badge>
              </div>
              <div className="flex items-center text-sm text-muted-foreground mt-1">
                <Calendar className="h-4 w-4 mr-1" />
                {format(new Date(request.startDate), 'MMM d, yyyy')}
                {request.startDate !== request.endDate && (
                  <> - {format(new Date(request.endDate), 'MMM d, yyyy')}</>
                )}
                <span className="ml-2">({request.totalDays} {t('common.days')})</span>
              </div>
            </div>
          </div>

          {showActions && request.status === 'pending' && (
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm"
                variant="outline"
                className="text-green-600 hover:text-green-700 hover:bg-green-50"
                onClick={() => setActionRequest({ request, action: 'approve' })}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                {t('leave.approve')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => setActionRequest({ request, action: 'deny' })}
              >
                <XCircle className="h-4 w-4 mr-1" />
                {t('leave.deny')}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('leave.title')}</h1>
        <p className="text-muted-foreground">
          {t('descriptions.leaveRequests')}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('leave.pendingRequests')}
            </CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pendingLoading ? <Skeleton className="h-8 w-8" /> : pendingRequests?.length || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('leave.currentlyOut')}
            </CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{currentlyOnLeave?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('leave.upcoming')}
            </CardTitle>
            <Calendar className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{upcomingLeave?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <TabsList>
            <TabsTrigger value="pending">
              {t('leave.pendingRequests')} ({pendingRequests?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="all">{t('common.all')}</TabsTrigger>
          </TabsList>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t('common.filter')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('common.all')}</SelectItem>
              <SelectItem value="pending">{t('leave.status.pending')}</SelectItem>
              <SelectItem value="approved">{t('leave.status.approved')}</SelectItem>
              <SelectItem value="denied">{t('leave.status.denied')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <TabsContent value="pending" className="mt-4">
          {pendingLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : pendingRequests && pendingRequests.length > 0 ? (
            <div className="space-y-4">
              {pendingRequests.map((r) => renderRequestCard(r, true))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">{t('leave.noRequests')}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          {allLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : allRequests && allRequests.length > 0 ? (
            <div className="space-y-4">
              {allRequests.map((r) => renderRequestCard(r, r.status === 'pending'))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">{t('leave.noRequests')}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!actionRequest} onOpenChange={() => setActionRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionRequest?.action === 'approve' ? t('leave.approve') : t('leave.deny')}
            </DialogTitle>
            <DialogDescription>
              {actionRequest?.action === 'approve'
                ? t('leave.approveDescription')
                : t('leave.denyDescription')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {actionRequest && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="font-medium">{(actionRequest.request.user as { fullName: string })?.fullName}</p>
                <p className="text-sm text-muted-foreground">
                  {actionRequest.request.leaveType === 'pto' ? t('leave.pto') : t('leave.sick')} •{' '}
                  {actionRequest.request.totalDays} {t('common.days')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(actionRequest.request.startDate), 'MMM d, yyyy')}
                  {actionRequest.request.startDate !== actionRequest.request.endDate && (
                    <> - {format(new Date(actionRequest.request.endDate), 'MMM d, yyyy')}</>
                  )}
                </p>
              </div>
            )}

            <div>
              <label className="text-sm font-medium">{t('leave.adminNotes')} {t('leave.optional')}</label>
              <Textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder={t('leave.addNotesPlaceholder')}
                rows={3}
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActionRequest(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleAction}
              disabled={approveRequest.isPending || denyRequest.isPending}
              variant={actionRequest?.action === 'approve' ? 'default' : 'destructive'}
            >
              {actionRequest?.action === 'approve' ? t('leave.approve') : t('leave.deny')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Detail Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('leave.requestDetails')}</DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              {/* Employee Info */}
              <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
                <Avatar className="h-14 w-14">
                  <AvatarImage src={selectedRequest.user?.avatarUrl || undefined} />
                  <AvatarFallback className="text-lg">
                    {selectedRequest.user?.fullName?.[0] || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-lg">
                    {selectedRequest.user?.fullName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedRequest.user?.email}
                  </p>
                </div>
              </div>

              {/* Request Details */}
              <div className="grid gap-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">{t('leave.leaveType')}</span>
                  <Badge variant="secondary">
                    {selectedRequest.leaveType === 'pto' ? t('leave.pto') : t('leave.sick')}
                  </Badge>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">{t('common.status')}</span>
                  <Badge className={statusColors[selectedRequest.status]}>
                    {t(`leave.status.${selectedRequest.status}`)}
                  </Badge>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">{t('leave.startDate')}</span>
                  <span className="font-medium">{format(new Date(selectedRequest.startDate), 'EEEE, MMM d, yyyy')}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">{t('leave.endDate')}</span>
                  <span className="font-medium">{format(new Date(selectedRequest.endDate), 'EEEE, MMM d, yyyy')}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">{t('reports.stats.totalDaysOff')}</span>
                  <span className="font-medium">{selectedRequest.totalDays} {t('common.days')}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">{t('leave.submitted')}</span>
                  <span className="font-medium">{format(new Date(selectedRequest.createdAt), 'MMM d, yyyy h:mm a')}</span>
                </div>
              </div>

              {/* Reason */}
              {selectedRequest.reason && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm font-medium text-blue-700 mb-1">{t('leave.reason')}</p>
                  <p className="text-sm text-blue-600">{selectedRequest.reason}</p>
                </div>
              )}

              {/* Admin Notes */}
              {selectedRequest.adminNotes && (
                <div className="p-3 bg-gray-100 rounded-lg">
                  <p className="text-sm font-medium text-gray-700 mb-1">{t('leave.adminNotes')}</p>
                  <p className="text-sm text-gray-600">{selectedRequest.adminNotes}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            {selectedRequest?.status === 'pending' && (
              <>
                <Button
                  variant="outline"
                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                  onClick={() => {
                    setActionRequest({ request: selectedRequest, action: 'approve' });
                    setSelectedRequest(null);
                  }}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  {t('leave.approve')}
                </Button>
                <Button
                  variant="outline"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => {
                    setActionRequest({ request: selectedRequest, action: 'deny' });
                    setSelectedRequest(null);
                  }}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  {t('leave.deny')}
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setSelectedRequest(null)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
