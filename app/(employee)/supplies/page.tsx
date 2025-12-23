'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
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
import { useMySupplyRequests, useCreateSupplyRequest, useCancelSupplyRequest } from '@/hooks/use-supplies';
import { format } from 'date-fns';
import { Plus, Package, ExternalLink, X, Loader2, Clock, CheckCircle, XCircle } from 'lucide-react';
import type { SupplyRequest } from '@/types';

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

const formSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional(),
  productUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
});

type FormData = z.infer<typeof formSchema>;

export default function SuppliesPage() {
  const t = useTranslations();
  const { user } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [cancelRequestId, setCancelRequestId] = useState<string | null>(null);

  const { data: requests, isLoading } = useMySupplyRequests(user?.id);
  const createRequest = useCreateSupplyRequest();
  const cancelRequest = useCancelSupplyRequest();

  const pendingRequests = requests?.filter((r) => r.status === 'pending') || [];
  const approvedRequests = requests?.filter((r) => r.status === 'approved') || [];
  const rejectedRequests = requests?.filter((r) => r.status === 'rejected') || [];

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      productUrl: '',
    },
  });

  const onSubmit = async (data: FormData) => {
    await createRequest.mutateAsync({
      title: data.title,
      description: data.description || undefined,
      productUrl: data.productUrl || undefined,
    });
    form.reset();
    setIsDialogOpen(false);
  };

  const handleCancelRequest = async () => {
    if (cancelRequestId) {
      await cancelRequest.mutateAsync(cancelRequestId);
      setCancelRequestId(null);
    }
  };

  const renderRequestCard = (request: SupplyRequest, showCancel = false) => (
    <Card key={request.id}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
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
              <p className="text-sm text-muted-foreground">{request.description}</p>
            )}

            {request.productUrl && (
              <a
                href={request.productUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-sm text-blue-600 hover:underline"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                {t('descriptions.viewProduct')}
              </a>
            )}

            <p className="text-xs text-muted-foreground">
              {t('descriptions.requested')} {format(new Date(request.createdAt), 'MMM d, yyyy h:mm a')}
            </p>

            {request.adminNotes && (
              <p className="text-sm text-muted-foreground mt-2 p-2 bg-gray-50 rounded italic">
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
          <h1 className="text-2xl font-bold text-gray-900">{t('nav.supplyRequests')}</h1>
          <p className="text-muted-foreground">
            {t('descriptions.supplies')}
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              {t('nav.requestSupply')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('nav.requestASupply')}</DialogTitle>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('nav.whatDoYouNeed')}</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder={t('nav.whatDoYouNeedPlaceholder')} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="productUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('nav.productLinkOptional')}</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="https://amazon.com/..." />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('nav.descriptionOptional')}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder={t('nav.additionalDetails')}
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" disabled={createRequest.isPending}>
                    {createRequest.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    {t('nav.submitRequest')}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
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
              {[1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : pendingRequests.length > 0 ? (
            <div className="space-y-4">
              {pendingRequests.map((r) => renderRequestCard(r, true))}
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
              {[1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : approvedRequests.length > 0 ? (
            <div className="space-y-4">
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
              {[1, 2].map((i) => <Skeleton key={i} className="h-32" />)}
            </div>
          ) : rejectedRequests.length > 0 ? (
            <div className="space-y-4">
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

      <AlertDialog open={!!cancelRequestId} onOpenChange={() => setCancelRequestId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('nav.cancelRequest')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('nav.cancelSupplyConfirmation')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.no')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelRequest}>
              {t('nav.yesCancel')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
