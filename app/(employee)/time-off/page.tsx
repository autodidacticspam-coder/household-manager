'use client';

import { useState } from 'react';
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
import { Plus, Calendar, X } from 'lucide-react';
import type { LeaveRequest } from '@/types';

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
              <Badge variant="secondary">
                {request.leaveType === 'pto' ? t('leave.pto') : t('leave.sick')}
              </Badge>
              <Badge className={statusColors[request.status]}>
                {t(`leave.status.${request.status}`)}
              </Badge>
            </div>
            <div className="flex items-center text-sm text-muted-foreground mt-2">
              <Calendar className="h-4 w-4 mr-1" />
              {format(new Date(request.startDate), 'MMM d, yyyy')}
              {request.startDate !== request.endDate && (
                <> - {format(new Date(request.endDate), 'MMM d, yyyy')}</>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {request.totalDays} {request.totalDays === 1 ? t('common.day') : t('common.days')}
              {!request.isFullDay && ` ${t('leave.partial')}`}
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
