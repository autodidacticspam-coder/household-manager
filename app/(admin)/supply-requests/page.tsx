'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useSupplyRequests,
  useApproveSupplyRequest,
  useRejectSupplyRequest,
} from '@/hooks/use-supplies';
import { format } from 'date-fns';
import {
  Package,
  ExternalLink,
  Clock,
  CheckCircle,
  XCircle,
  User,
  Loader2,
} from 'lucide-react';
import type { SupplyRequest } from '@/types';

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function AdminSupplyRequestsPage() {
  const t = useTranslations();
  const [selectedRequest, setSelectedRequest] = useState<SupplyRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');

  const { data: requests, isLoading } = useSupplyRequests();
  const approveRequest = useApproveSupplyRequest();
  const rejectRequest = useRejectSupplyRequest();

  const pendingRequests = requests?.filter((r) => r.status === 'pending') || [];
  const approvedRequests = requests?.filter((r) => r.status === 'approved') || [];
  const rejectedRequests = requests?.filter((r) => r.status === 'rejected') || [];

  const handleApprove = async (id: string) => {
    await approveRequest.mutateAsync({ id, adminNotes: adminNotes || undefined });
    setSelectedRequest(null);
    setAdminNotes('');
  };

  const handleReject = async (id: string) => {
    await rejectRequest.mutateAsync({ id, adminNotes: adminNotes || undefined });
    setSelectedRequest(null);
    setAdminNotes('');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const renderRequestCard = (request: SupplyRequest) => (
    <Card
      key={request.id}
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => {
        setSelectedRequest(request);
        setAdminNotes('');
      }}
    >
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={request.user?.avatarUrl || undefined} />
                <AvatarFallback>
                  {request.user?.fullName ? getInitials(request.user.fullName) : <User className="h-4 w-4" />}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-sm">{request.user?.fullName || t('employees.unknownUser')}</p>
                <p className="text-xs text-muted-foreground">{request.user?.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">{request.title}</h3>
            </div>

            <Badge className={statusColors[request.status]}>
              {request.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
              {request.status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
              {request.status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
              {request.status === 'pending' ? t('leave.status.pending') : request.status === 'approved' ? t('nav.approved') : t('nav.rejected')}
            </Badge>

            {request.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">{request.description}</p>
            )}

            {request.productUrl && (
              <a
                href={request.productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-sm text-blue-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                {t('descriptions.viewProduct')}
              </a>
            )}

            <p className="text-xs text-muted-foreground">
              {t('descriptions.requested')} {format(new Date(request.createdAt), 'MMM d, yyyy h:mm a')}
            </p>

            {request.status === 'pending' && (
              <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  onClick={() => handleApprove(request.id)}
                  disabled={approveRequest.isPending || rejectRequest.isPending}
                >
                  {approveRequest.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {t('nav.approve')}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleReject(request.id)}
                  disabled={approveRequest.isPending || rejectRequest.isPending}
                >
                  {rejectRequest.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                  <XCircle className="h-3 w-3 mr-1" />
                  {t('nav.reject')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('nav.supplyRequests')}</h1>
        <p className="text-muted-foreground">
          {t('descriptions.supplyRequests')}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('leave.status.pending')}</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <Skeleton className="h-8 w-8" /> : pendingRequests.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('nav.approved')}</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <Skeleton className="h-8 w-8" /> : approvedRequests.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('nav.rejected')}</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <Skeleton className="h-8 w-8" /> : rejectedRequests.length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            {t('leave.status.pending')} ({pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="approved">
            {t('nav.approved')} ({approvedRequests.length})
          </TabsTrigger>
          <TabsTrigger value="rejected">
            {t('nav.rejected')} ({rejectedRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
            </div>
          ) : pendingRequests.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {pendingRequests.map((r) => renderRequestCard(r))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">{t('descriptions.noPendingRequests')}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="approved" className="mt-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
            </div>
          ) : approvedRequests.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {approvedRequests.map((r) => renderRequestCard(r))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">{t('descriptions.noApprovedRequests')}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="rejected" className="mt-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
            </div>
          ) : rejectedRequests.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {rejectedRequests.map((r) => renderRequestCard(r))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">{t('descriptions.noRejectedRequests')}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('nav.supplyRequestDetails')}</DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={selectedRequest.user?.avatarUrl || undefined} />
                  <AvatarFallback>
                    {selectedRequest.user?.fullName ? getInitials(selectedRequest.user.fullName) : <User className="h-5 w-5" />}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{selectedRequest.user?.fullName || t('employees.unknownUser')}</p>
                  <p className="text-sm text-muted-foreground">{selectedRequest.user?.email}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold text-lg">{selectedRequest.title}</h3>
                </div>

                <Badge className={statusColors[selectedRequest.status]}>
                  {selectedRequest.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                  {selectedRequest.status === 'approved' && <CheckCircle className="h-3 w-3 mr-1" />}
                  {selectedRequest.status === 'rejected' && <XCircle className="h-3 w-3 mr-1" />}
                  {selectedRequest.status === 'pending' ? t('leave.status.pending') : selectedRequest.status === 'approved' ? t('nav.approved') : t('nav.rejected')}
                </Badge>
              </div>

              {selectedRequest.description && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">{t('descriptions.description')}</p>
                  <p className="text-sm">{selectedRequest.description}</p>
                </div>
              )}

              {selectedRequest.productUrl && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">{t('descriptions.productLink')}</p>
                  <a
                    href={selectedRequest.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-sm text-blue-600 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    {selectedRequest.productUrl}
                  </a>
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">{t('descriptions.requested')}</p>
                <p className="text-sm">{format(new Date(selectedRequest.createdAt), 'MMMM d, yyyy \'at\' h:mm a')}</p>
              </div>

              {selectedRequest.reviewedAt && selectedRequest.reviewedByUser && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">{t('descriptions.reviewed')}</p>
                  <p className="text-sm">
                    {t('descriptions.reviewedBy', { name: selectedRequest.reviewedByUser.fullName, date: format(new Date(selectedRequest.reviewedAt), 'MMMM d, yyyy') })}
                  </p>
                </div>
              )}

              {selectedRequest.adminNotes && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-muted-foreground mb-1">{t('leave.adminNotes')}</p>
                  <p className="text-sm italic">{selectedRequest.adminNotes}</p>
                </div>
              )}

              {selectedRequest.status === 'pending' && (
                <>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">
                      {t('leave.adminNotes')} {t('leave.optional')}
                    </label>
                    <Textarea
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder={t('leave.addNotesPlaceholder')}
                      rows={2}
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <Button
                      className="flex-1"
                      onClick={() => handleApprove(selectedRequest.id)}
                      disabled={approveRequest.isPending || rejectRequest.isPending}
                    >
                      {approveRequest.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      <CheckCircle className="h-4 w-4 mr-2" />
                      {t('nav.approve')}
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => handleReject(selectedRequest.id)}
                      disabled={approveRequest.isPending || rejectRequest.isPending}
                    >
                      {rejectRequest.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      <XCircle className="h-4 w-4 mr-2" />
                      {t('nav.reject')}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
