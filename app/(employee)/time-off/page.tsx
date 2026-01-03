'use client';

import { useState } from 'react';
import { formatTime12h } from '@/lib/format-time';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useMyLeaveRequests, useCancelLeaveRequest } from '@/hooks/use-leave';
import { format } from 'date-fns';
import { Plus, Calendar, X, Clock } from 'lucide-react';
import type { LeaveRequest } from '@/types';

// Helper to parse date string without timezone issues
const parseLocalDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Helper to check if a leave request is a holiday
function isHoliday(request: LeaveRequest): boolean {
  return request.leaveType === 'holiday' || request.reason?.startsWith('Holiday:') || false;
}

// Helper to get leave type display label
function getLeaveTypeLabel(request: LeaveRequest, t: (key: string) => string): string {
  if (isHoliday(request)) {
    return t('leave.holiday');
  }
  return request.leaveType === 'vacation' ? t('leave.vacation') : t('leave.sick');
}

// Helper to get badge class based on leave type
function getLeaveTypeBadgeClass(request: LeaveRequest): string {
  if (isHoliday(request)) {
    return 'bg-amber-100 text-amber-700';
  }
  if (request.leaveType === 'vacation') {
    return '';  // default variant
  }
  return 'bg-green-100 text-green-700';  // sick
}

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  denied: 'bg-red-100 text-red-700',
};

export default function TimeOffPage() {
  const t = useTranslations();
  const router = useRouter();
  const { user } = useAuth();
  const [cancelRequestId, setCancelRequestId] = useState<string | null>(null);

  const { data: requests, isLoading: requestsLoading } = useMyLeaveRequests(user?.id);
  const cancelRequest = useCancelLeaveRequest();

  const pendingRequests = requests?.filter((r) => r.status === 'pending') || [];
  const approvedRequests = requests?.filter((r) => r.status === 'approved') || [];
  const deniedRequests = requests?.filter((r) => r.status === 'denied') || [];

  const handleCancelRequest = async () => {
    if (cancelRequestId) {
      await cancelRequest.mutateAsync(cancelRequestId);
      setCancelRequestId(null);
    }
  };

  const renderRequestCard = (request: LeaveRequest, showCancel = false) => (
    <Card key={request.id} className="relative">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className={getLeaveTypeBadgeClass(request)}>
                {getLeaveTypeLabel(request, t)}
              </Badge>
              <Badge className={statusColors[request.status]}>
                {t(`leave.status.${request.status}`)}
              </Badge>
            </div>
            <div className="flex items-center text-sm text-muted-foreground mt-2">
              <Calendar className="h-4 w-4 mr-1" />
              {format(parseLocalDate(request.startDate), 'MMM d, yyyy')}
              {request.startDate !== request.endDate && (
                <> - {format(parseLocalDate(request.endDate), 'MMM d, yyyy')}</>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {request.totalDays} {request.totalDays === 1 ? t('common.day') : t('common.days')}
              {!request.isFullDay && (
                <>
                  {' '}({t('leave.partial')})
                  {request.startTime && request.endTime && (
                    <span className="flex items-center gap-1 mt-1">
                      <Clock className="h-3 w-3" />
                      {formatTime12h(request.startTime)} - {formatTime12h(request.endTime)}
                    </span>
                  )}
                </>
              )}
            </p>
            {request.reason && (
              <p className="text-sm mt-2">{request.reason}</p>
            )}
            {request.adminNotes && (
              <p className="text-sm text-muted-foreground mt-2 italic">
                {t('leave.adminNotes')}: {request.adminNotes}
              </p>
            )}
          </div>
          {showCancel && request.status === 'pending' && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCancelRequestId(request.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('nav.timeOff')}</h1>
          <p className="text-muted-foreground">
            {t('descriptions.timeOff')}
          </p>
        </div>
        <Button onClick={() => router.push('/time-off/request')}>
          <Plus className="h-4 w-4 mr-2" />
          {t('leave.requestTimeOff')}
        </Button>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            {t('leave.status.pending')} ({pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="approved">
            {t('leave.status.approved')} ({approvedRequests.length})
          </TabsTrigger>
          <TabsTrigger value="denied">
            {t('leave.status.denied')} ({deniedRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {requestsLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : pendingRequests.length > 0 ? (
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

        <TabsContent value="approved" className="mt-4">
          {requestsLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : approvedRequests.length > 0 ? (
            <div className="space-y-4">
              {approvedRequests.map((r) => renderRequestCard(r))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">{t('leave.noRequests')}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="denied" className="mt-4">
          {requestsLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : deniedRequests.length > 0 ? (
            <div className="space-y-4">
              {deniedRequests.map((r) => renderRequestCard(r))}
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

      <AlertDialog open={!!cancelRequestId} onOpenChange={() => setCancelRequestId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('leave.cancelConfirmation')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.no')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelRequest}>
              {t('common.yes')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
