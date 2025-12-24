'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
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
  useCancelLeaveRequest,
} from '@/hooks/use-leave';
import { useEmployeesList } from '@/hooks/use-employees';
import { format, eachDayOfInterval } from 'date-fns';
import { Calendar, CheckCircle, XCircle, Users, Clock, Plus, Sparkles, Loader2, X, Trash2, User } from 'lucide-react';
import type { LeaveRequest } from '@/types';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

// Helper to parse date string without timezone issues
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Helper to check if a leave request is a holiday
function isHoliday(request: LeaveRequest): boolean {
  return request.reason?.startsWith('Holiday:') || false;
}

// Helper to get leave type display label
function getLeaveTypeLabel(request: LeaveRequest, t: (key: string) => string): string {
  if (isHoliday(request)) {
    return 'Holiday';
  }
  return request.leaveType === 'pto' ? t('leave.pto') : t('leave.sick');
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

// Helper to get badge class based on leave type
function getLeaveTypeBadgeClass(request: LeaveRequest): string {
  if (isHoliday(request)) {
    return 'bg-amber-100 text-amber-700';
  }
  if (request.leaveType === 'pto') {
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

// Calculate a specific holiday for a given year
function getMemorialDay(year: number): Date {
  const may31 = new Date(year, 4, 31);
  const offset = may31.getDay() === 0 ? 6 : may31.getDay() - 1;
  return new Date(year, 4, 31 - offset);
}

function getLaborDay(year: number): Date {
  const sep1 = new Date(year, 8, 1);
  const offset = sep1.getDay() === 0 ? 1 : sep1.getDay() === 1 ? 0 : 8 - sep1.getDay();
  return new Date(year, 8, 1 + offset);
}

function getThanksgiving(year: number): Date {
  const nov1 = new Date(year, 10, 1);
  const firstThursday = nov1.getDay() <= 4 ? 4 - nov1.getDay() : 11 - nov1.getDay();
  return new Date(year, 10, 1 + firstThursday + 21);
}

// Get upcoming US holidays (uses next year's date if holiday has passed)
function getUpcomingUSHolidays() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentYear = today.getFullYear();

  // Helper to get next upcoming date for a holiday
  const getNextDate = (getHoliday: (year: number) => Date): Date => {
    const thisYear = getHoliday(currentYear);
    return thisYear >= today ? thisYear : getHoliday(currentYear + 1);
  };

  const getNextFixedDate = (month: number, day: number): Date => {
    const thisYear = new Date(currentYear, month, day);
    return thisYear >= today ? thisYear : new Date(currentYear + 1, month, day);
  };

  const thanksgiving = getNextDate(getThanksgiving);
  const dayAfterThanksgiving = new Date(thanksgiving);
  dayAfterThanksgiving.setDate(dayAfterThanksgiving.getDate() + 1);

  return [
    { name: 'Memorial Day', date: getNextDate(getMemorialDay) },
    { name: 'Independence Day', date: getNextFixedDate(6, 4) },
    { name: 'Labor Day', date: getNextDate(getLaborDay) },
    { name: 'Thanksgiving', date: thanksgiving },
    { name: 'Day After Thanksgiving', date: dayAfterThanksgiving },
    { name: 'Christmas Eve', date: getNextFixedDate(11, 24) },
    { name: 'Christmas Day', date: getNextFixedDate(11, 25) },
    { name: "New Year's Day", date: getNextFixedDate(0, 1) },
  ];
}

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  denied: 'bg-red-100 text-red-700',
};

export default function LeaveRequestsPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const supabase = createClient();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [actionRequest, setActionRequest] = useState<{ request: LeaveRequest; action: 'approve' | 'deny' } | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<LeaveRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');

  // Summary card popup state
  const [showPendingPopup, setShowPendingPopup] = useState(false);
  const [showCurrentlyOutPopup, setShowCurrentlyOutPopup] = useState(false);
  const [showUpcomingPopup, setShowUpcomingPopup] = useState(false);

  // Vacation management state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showHolidayDialog, setShowHolidayDialog] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [addingEmployee, setAddingEmployee] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedHolidays, setSelectedHolidays] = useState<string[]>([]);
  const [selectedEmployeesForHolidays, setSelectedEmployeesForHolidays] = useState<string[]>([]);

  const { data: allRequestsRaw, isLoading: allLoading } = useLeaveRequests(
    statusFilter !== 'all' ? { status: statusFilter as 'pending' | 'approved' | 'denied' } : undefined
  );
  const { data: pendingRequestsRaw, isLoading: pendingLoading } = usePendingLeaveRequests();
  const { data: currentlyOnLeaveRaw } = useCurrentlyOnLeave();
  const { data: upcomingLeaveRaw } = useUpcomingLeave();
  const { data: employees } = useEmployeesList();

  // Filter by employee
  const filterByEmployee = useCallback((requests: LeaveRequest[] | undefined) => {
    if (!requests) return [];
    if (employeeFilter === 'all') return requests;
    return requests.filter(r => r.userId === employeeFilter);
  }, [employeeFilter]);

  const allRequests = useMemo(() => filterByEmployee(allRequestsRaw), [allRequestsRaw, filterByEmployee]);
  const pendingRequests = useMemo(() => filterByEmployee(pendingRequestsRaw), [pendingRequestsRaw, filterByEmployee]);
  const currentlyOnLeave = useMemo(() => filterByEmployee(currentlyOnLeaveRaw), [currentlyOnLeaveRaw, filterByEmployee]);
  const upcomingLeave = useMemo(() => filterByEmployee(upcomingLeaveRaw), [upcomingLeaveRaw, filterByEmployee]);

  // Group leave entries by employee for proper counting and display
  const groupedCurrentlyOnLeave = useMemo(() => groupLeaveByEmployee(currentlyOnLeave), [currentlyOnLeave]);

  const approveRequest = useApproveLeaveRequest();
  const denyRequest = useDenyLeaveRequest();
  const cancelRequest = useCancelLeaveRequest();

  const [deleteRequest, setDeleteRequest] = useState<LeaveRequest | null>(null);

  const holidays = getUpcomingUSHolidays();

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

  const handleAddVacation = async () => {
    if (!addingEmployee || selectedDates.length === 0) {
      toast.error('Please select an employee and at least one date');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const sortedDates = selectedDates.sort((a, b) => a.getTime() - b.getTime());
      const startDate = format(sortedDates[0], 'yyyy-MM-dd');
      const endDate = format(sortedDates[sortedDates.length - 1], 'yyyy-MM-dd');
      const selectedDatesStr = sortedDates.map(d => format(d, 'yyyy-MM-dd'));

      const { error } = await supabase
        .from('leave_requests')
        .insert({
          user_id: addingEmployee,
          leave_type: 'pto',
          status: 'approved',
          start_date: startDate,
          end_date: endDate,
          selected_dates: selectedDatesStr,
          is_full_day: true,
          total_days: selectedDates.length,
          reason: 'Added by admin',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast.success('Vacation days added successfully');
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-leave-requests'] });
      setShowAddDialog(false);
      setSelectedDates([]);
      setAddingEmployee('');
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error('Error adding vacation:', err);
      toast.error(err.message || 'Failed to add vacation days');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddHolidays = async () => {
    if (selectedEmployeesForHolidays.length === 0 || selectedHolidays.length === 0) {
      toast.error('Please select at least one employee and one holiday');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const holidayDates = holidays.filter(h => selectedHolidays.includes(h.name));

      const insertData = selectedEmployeesForHolidays.flatMap(employeeId =>
        holidayDates.map(holiday => ({
          user_id: employeeId,
          leave_type: 'pto' as const,
          status: 'approved' as const,
          start_date: format(holiday.date, 'yyyy-MM-dd'),
          end_date: format(holiday.date, 'yyyy-MM-dd'),
          selected_dates: [format(holiday.date, 'yyyy-MM-dd')],
          is_full_day: true,
          total_days: 1,
          reason: `Holiday: ${holiday.name}`,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        }))
      );

      const { error } = await supabase
        .from('leave_requests')
        .insert(insertData);

      if (error) throw error;

      toast.success(`Added ${holidayDates.length} holiday(s) for ${selectedEmployeesForHolidays.length} employee(s)`);
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['pending-leave-requests'] });
      setShowHolidayDialog(false);
      setSelectedHolidays([]);
      setSelectedEmployeesForHolidays([]);
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error('Error adding holidays:', err);
      toast.error(err.message || 'Failed to add holidays');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleHoliday = (name: string) => {
    setSelectedHolidays(prev =>
      prev.includes(name) ? prev.filter(h => h !== name) : [...prev, name]
    );
  };

  const toggleEmployeeForHoliday = (id: string) => {
    setSelectedEmployeesForHolidays(prev =>
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const selectAllEmployees = () => {
    if (employees) {
      setSelectedEmployeesForHolidays(employees.map(e => e.id));
    }
  };

  const removeDate = (dateToRemove: Date) => {
    setSelectedDates(prev => prev.filter(d => d.getTime() !== dateToRemove.getTime()));
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
                  {getLeaveTypeLabel(request, t)}
                </Badge>
                <Badge className={statusColors[request.status]}>
                  {t(`leave.status.${request.status}`)}
                </Badge>
              </div>
              <div className="mt-2">
                <div className="flex items-center text-sm text-muted-foreground mb-1">
                  <Calendar className="h-4 w-4 mr-1" />
                  <span>{request.totalDays} {t('common.days')}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {getRequestDates(request).map((date, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs font-normal">
                      {format(date, 'EEE, MMM d')}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            {showActions && request.status === 'pending' && (
              <>
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
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-gray-500 hover:text-red-600 hover:bg-red-50"
              onClick={() => setDeleteRequest(request)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('leave.title')}</h1>
          <p className="text-muted-foreground">
            {t('descriptions.leaveRequests')}
          </p>
          {employeeFilter !== 'all' && (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary" className="flex items-center gap-1">
                <User className="h-3 w-3" />
                Filtering: {employees?.find(e => e.id === employeeFilter)?.fullName}
                <button
                  onClick={() => setEmployeeFilter('all')}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowHolidayDialog(true)}>
            <Sparkles className="h-4 w-4 mr-2" />
            Add Holidays
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Vacation
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow hover:border-yellow-300"
          onClick={() => pendingRequests && pendingRequests.length > 0 && setShowPendingPopup(true)}
        >
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
            {pendingRequests && pendingRequests.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">Click for details</p>
            )}
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow hover:border-blue-300"
          onClick={() => groupedCurrentlyOnLeave.length > 0 && setShowCurrentlyOutPopup(true)}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('leave.currentlyOut')}
            </CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{groupedCurrentlyOnLeave.length}</div>
            {groupedCurrentlyOnLeave.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">Click for details</p>
            )}
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:shadow-md transition-shadow hover:border-green-300"
          onClick={() => upcomingLeave && upcomingLeave.length > 0 && setShowUpcomingPopup(true)}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('leave.upcoming')}
            </CardTitle>
            <Calendar className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{upcomingLeave?.length || 0}</div>
            {upcomingLeave && upcomingLeave.length > 0 && (
              <p className="text-xs text-muted-foreground mt-1">Click for details</p>
            )}
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

          <div className="flex gap-2">
            <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
              <SelectTrigger className="w-48">
                <User className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employees?.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

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

      {/* Approve/Deny Dialog */}
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
              <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                <p className="font-medium">{(actionRequest.request.user as { fullName: string })?.fullName}</p>
                <p className="text-sm text-muted-foreground">
                  {getLeaveTypeLabel(actionRequest.request, t)} •{' '}
                  {actionRequest.request.totalDays} {t('common.days')}
                </p>
                <div className="flex flex-wrap gap-1">
                  {getRequestDates(actionRequest.request).map((date, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs font-normal">
                      {format(date, 'EEE, MMM d')}
                    </Badge>
                  ))}
                </div>
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

              <div className="grid gap-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">{t('leave.leaveType')}</span>
                  <Badge variant="secondary">
                    {getLeaveTypeLabel(selectedRequest, t)}
                  </Badge>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">{t('common.status')}</span>
                  <Badge className={statusColors[selectedRequest.status]}>
                    {t(`leave.status.${selectedRequest.status}`)}
                  </Badge>
                </div>
                <div className="py-2 border-b">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-muted-foreground">{t('reports.stats.totalDaysOff')}</span>
                    <span className="font-medium">{selectedRequest.totalDays} {t('common.days')}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {getRequestDates(selectedRequest).map((date, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs py-1">
                        {format(date, 'EEE, MMM d')}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-muted-foreground">{t('leave.submitted')}</span>
                  <span className="font-medium">{format(new Date(selectedRequest.createdAt), 'MMM d, yyyy h:mm a')}</span>
                </div>
              </div>

              {selectedRequest.reason && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm font-medium text-blue-700 mb-1">{t('leave.reason')}</p>
                  <p className="text-sm text-blue-600">{selectedRequest.reason}</p>
                </div>
              )}

              {selectedRequest.adminNotes && (
                <div className="p-3 bg-gray-100 rounded-lg">
                  <p className="text-sm font-medium text-gray-700 mb-1">{t('leave.adminNotes')}</p>
                  <p className="text-sm text-gray-600">{selectedRequest.adminNotes}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="text-red-600 hover:text-red-700 hover:bg-red-50 sm:mr-auto"
              onClick={() => {
                setDeleteRequest(selectedRequest);
                setSelectedRequest(null);
              }}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
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

      {/* Add Vacation Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Vacation Days
            </DialogTitle>
            <DialogDescription>
              Select an employee and pick vacation days from the calendar
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Employee</Label>
              <Select value={addingEmployee} onValueChange={setAddingEmployee}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select employee..." />
                </SelectTrigger>
                <SelectContent>
                  {employees?.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedDates.length > 0 && (
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">
                    Selected: {selectedDates.length} day{selectedDates.length !== 1 ? 's' : ''}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDates([])}
                    className="h-6 px-2 text-xs"
                  >
                    Clear all
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedDates.sort((a, b) => a.getTime() - b.getTime()).map((date) => (
                    <Badge
                      key={date.toISOString()}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      {format(date, 'EEE, MMM d')}
                      <button
                        type="button"
                        onClick={() => removeDate(date)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-center border rounded-lg p-4">
              <CalendarPicker
                mode="multiple"
                selected={selectedDates}
                onSelect={(dates) => setSelectedDates(dates || [])}
                numberOfMonths={2}
                className="rounded-md"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowAddDialog(false);
              setSelectedDates([]);
              setAddingEmployee('');
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleAddVacation}
              disabled={isSubmitting || !addingEmployee || selectedDates.length === 0}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add {selectedDates.length} Day{selectedDates.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Holidays Dialog */}
      <Dialog open={showHolidayDialog} onOpenChange={setShowHolidayDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Add Holidays for Employees
            </DialogTitle>
            <DialogDescription>
              Pre-populate holiday vacation days for selected employees
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Select Holidays</Label>
              </div>
              <div className="space-y-2 p-3 border rounded-lg">
                {holidays.map(holiday => (
                  <div key={holiday.name} className="flex items-center space-x-2">
                    <Checkbox
                      id={holiday.name}
                      checked={selectedHolidays.includes(holiday.name)}
                      onCheckedChange={() => toggleHoliday(holiday.name)}
                    />
                    <label htmlFor={holiday.name} className="text-sm flex-1 cursor-pointer">
                      {holiday.name}
                    </label>
                    <span className="text-sm text-muted-foreground">
                      {format(holiday.date, 'EEE, MMM d, yyyy')}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Select Employees</Label>
                <Button variant="ghost" size="sm" onClick={selectAllEmployees}>
                  Select All
                </Button>
              </div>
              <div className="space-y-2 p-3 border rounded-lg max-h-48 overflow-y-auto">
                {employees?.map(emp => (
                  <div key={emp.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={emp.id}
                      checked={selectedEmployeesForHolidays.includes(emp.id)}
                      onCheckedChange={() => toggleEmployeeForHoliday(emp.id)}
                    />
                    <label htmlFor={emp.id} className="text-sm flex-1 cursor-pointer">
                      {emp.fullName}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowHolidayDialog(false);
              setSelectedHolidays([]);
              setSelectedEmployeesForHolidays([]);
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleAddHolidays}
              disabled={isSubmitting || selectedHolidays.length === 0 || selectedEmployeesForHolidays.length === 0}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Holidays
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pending Requests Popup */}
      <Dialog open={showPendingPopup} onOpenChange={setShowPendingPopup}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              {t('leave.pendingRequests')}
            </DialogTitle>
            <DialogDescription>
              {pendingRequests?.length || 0} request(s) awaiting approval
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {pendingRequests?.map((request) => (
              <div
                key={request.id}
                className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => {
                  setShowPendingPopup(false);
                  setSelectedRequest(request);
                }}
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={(request.user as { avatarUrl: string | null })?.avatarUrl || undefined} />
                  <AvatarFallback>
                    {(request.user as { fullName: string })?.fullName?.[0] || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{(request.user as { fullName: string })?.fullName}</p>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={() => {
                          setShowPendingPopup(false);
                          setActionRequest({ request, action: 'approve' });
                        }}
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => {
                          setShowPendingPopup(false);
                          setActionRequest({ request, action: 'deny' });
                        }}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {getLeaveTypeLabel(request, t)}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {request.totalDays} {t('common.days')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {getRequestDates(request).slice(0, 5).map((date, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs font-normal">
                        {format(date, 'MMM d')}
                      </Badge>
                    ))}
                    {getRequestDates(request).length > 5 && (
                      <Badge variant="outline" className="text-xs font-normal">
                        +{getRequestDates(request).length - 5} more
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPendingPopup(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Currently Out Popup */}
      <Dialog open={showCurrentlyOutPopup} onOpenChange={setShowCurrentlyOutPopup}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              {t('leave.currentlyOut')}
            </DialogTitle>
            <DialogDescription>
              {groupedCurrentlyOnLeave.length} employee(s) currently on leave
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {groupedCurrentlyOnLeave.map((group) => (
              <div key={group.userId} className="p-3 border rounded-lg">
                <div className="flex items-center gap-3 mb-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={group.user?.avatarUrl || undefined} />
                    <AvatarFallback>
                      {group.user?.fullName?.[0] || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <p className="font-medium">{group.user?.fullName}</p>
                </div>
                <div className="space-y-3 ml-13">
                  {group.leaveEntries.map((request) => (
                    <div
                      key={request.id}
                      className="p-2 rounded hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => {
                        setShowCurrentlyOutPopup(false);
                        setSelectedRequest(request);
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="secondary" className={`text-xs ${getLeaveTypeBadgeClass(request)}`}>
                          {getLeaveTypeLabel(request, t)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {request.totalDays} {request.totalDays === 1 ? t('common.day') : t('common.days')}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {getRequestDates(request).map((date, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs font-normal">
                            {format(date, 'EEE, MMM d')}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCurrentlyOutPopup(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upcoming Leave Popup */}
      <Dialog open={showUpcomingPopup} onOpenChange={setShowUpcomingPopup}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-green-500" />
              {t('leave.upcoming')}
            </DialogTitle>
            <DialogDescription>
              {upcomingLeave?.length || 0} upcoming leave request(s)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {upcomingLeave?.map((request) => (
              <div
                key={request.id}
                className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => {
                  setShowUpcomingPopup(false);
                  setSelectedRequest(request);
                }}
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={(request.user as { avatarUrl: string | null })?.avatarUrl || undefined} />
                  <AvatarFallback>
                    {(request.user as { fullName: string })?.fullName?.[0] || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{(request.user as { fullName: string })?.fullName}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {getLeaveTypeLabel(request, t)}
                    </Badge>
                    <Badge className="bg-green-100 text-green-700 text-xs">
                      Upcoming
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {request.totalDays} {t('common.days')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {getRequestDates(request).slice(0, 5).map((date, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs font-normal">
                        {format(date, 'MMM d')}
                      </Badge>
                    ))}
                    {getRequestDates(request).length > 5 && (
                      <Badge variant="outline" className="text-xs font-normal">
                        +{getRequestDates(request).length - 5} more
                      </Badge>
                    )}
                  </div>
                  {request.reason && (
                    <p className="text-sm text-muted-foreground mt-2 truncate">{request.reason}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpcomingPopup(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteRequest} onOpenChange={() => setDeleteRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete Leave Request
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this leave request? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {deleteRequest && (
            <div className="p-4 bg-gray-50 rounded-lg space-y-2">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={(deleteRequest.user as { avatarUrl: string | null })?.avatarUrl || undefined} />
                  <AvatarFallback>
                    {(deleteRequest.user as { fullName: string })?.fullName?.[0] || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{(deleteRequest.user as { fullName: string })?.fullName}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">
                      {getLeaveTypeLabel(deleteRequest, t)}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {deleteRequest.totalDays} {t('common.days')}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {getRequestDates(deleteRequest).slice(0, 5).map((date, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs font-normal">
                    {format(date, 'MMM d')}
                  </Badge>
                ))}
                {getRequestDates(deleteRequest).length > 5 && (
                  <Badge variant="outline" className="text-xs font-normal">
                    +{getRequestDates(deleteRequest).length - 5} more
                  </Badge>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRequest(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteRequest) {
                  cancelRequest.mutate(deleteRequest.id);
                  setDeleteRequest(null);
                }
              }}
              disabled={cancelRequest.isPending}
            >
              {cancelRequest.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
