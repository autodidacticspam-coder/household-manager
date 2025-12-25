'use client';

import { use, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useEmployee, useUpdateEmployee, useDeleteEmployee } from '@/hooks/use-employees';
import { useEmployeeGroups } from '@/hooks/use-tasks';
import { useMyLeaveRequests } from '@/hooks/use-leave';
import { useMyTasks } from '@/hooks/use-tasks';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
import type { LeaveRequest } from '@/types/leave';

// Parse date string as local date (not UTC) to avoid timezone issues
function parseLocalDate(dateStr: string): Date {
  return parseISO(dateStr + 'T12:00:00');
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
import { ArrowLeft, Mail, Phone, Calendar, CheckSquare, Users, Edit2, Trash2, Loader2, Plus, X, Gift } from 'lucide-react';
import { ScheduleEditor } from '@/components/admin/schedule-editor';

type EmployeeDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default function EmployeeDetailPage({ params }: EmployeeDetailPageProps) {
  const { id } = use(params);
  const t = useTranslations();
  const router = useRouter();

  const { data: employee, isLoading } = useEmployee(id);
  const { data: leaveRequests } = useMyLeaveRequests(id);
  const { data: tasks } = useMyTasks(id);
  const { data: groups } = useEmployeeGroups();
  const updateEmployee = useUpdateEmployee();
  const deleteEmployee = useDeleteEmployee();

  // Edit dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: '',
    phone: '',
    role: 'employee' as 'admin' | 'employee',
    dateOfBirth: '',
    hireDate: '',
    emergencyContact: '',
    notes: '',
    groupIds: [] as string[],
    importantDates: [] as { label: string; date: string }[],
  });
  const [newDateLabel, setNewDateLabel] = useState('');
  const [newDateValue, setNewDateValue] = useState('');

  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleOpenEditDialog = () => {
    if (employee) {
      setEditForm({
        fullName: employee.fullName || '',
        phone: employee.phone || '',
        role: employee.role,
        dateOfBirth: employee.profile?.dateOfBirth || '',
        hireDate: employee.profile?.hireDate || '',
        emergencyContact: employee.profile?.emergencyContact || '',
        notes: employee.profile?.notes || '',
        groupIds: employee.groups.map(g => g.id),
        importantDates: employee.profile?.importantDates || [],
      });
      setNewDateLabel('');
      setNewDateValue('');
      setShowEditDialog(true);
    }
  };

  const handleSaveEdit = async () => {
    await updateEmployee.mutateAsync({
      id,
      data: {
        fullName: editForm.fullName,
        phone: editForm.phone || undefined,
        groupIds: editForm.groupIds,
        dateOfBirth: editForm.dateOfBirth || undefined,
        hireDate: editForm.hireDate || undefined,
        emergencyContact: editForm.emergencyContact || undefined,
        notes: editForm.notes || undefined,
        importantDates: editForm.importantDates,
      },
    });
    setShowEditDialog(false);
  };

  const addImportantDate = () => {
    if (newDateLabel && newDateValue) {
      setEditForm(prev => ({
        ...prev,
        importantDates: [...prev.importantDates, { label: newDateLabel, date: newDateValue }],
      }));
      setNewDateLabel('');
      setNewDateValue('');
    }
  };

  const removeImportantDate = (index: number) => {
    setEditForm(prev => ({
      ...prev,
      importantDates: prev.importantDates.filter((_, i) => i !== index),
    }));
  };

  const handleDelete = async () => {
    await deleteEmployee.mutateAsync(id);
    router.push('/employees');
  };

  const toggleGroup = (groupId: string) => {
    setEditForm(prev => ({
      ...prev,
      groupIds: prev.groupIds.includes(groupId)
        ? prev.groupIds.filter(id => id !== groupId)
        : [...prev.groupIds, groupId],
    }));
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('errors.notFound')}</p>
      </div>
    );
  }

  const pendingTasks = tasks?.filter((t) => t.status !== 'completed').length || 0;
  const completedTasks = tasks?.filter((t) => t.status === 'completed').length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/employees')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{employee.fullName}</h1>
            <p className="text-muted-foreground">
              Employee Profile
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleOpenEditDialog}>
            <Edit2 className="h-4 w-4 mr-2" />
            {t('common.edit')}
          </Button>
          <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            {t('common.delete')}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('employees.profile')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start space-x-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={employee.avatarUrl || undefined} />
                  <AvatarFallback className="text-2xl">
                    {employee.fullName?.[0] || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <h2 className="text-xl font-semibold">{employee.fullName}</h2>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={employee.role === 'admin' ? 'default' : 'secondary'}>
                      {employee.role === 'admin' ? 'Administrator' : 'Employee'}
                    </Badge>
                    {employee.groups.map((group) => (
                      <Badge key={group.id} variant="outline">
                        {group.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <Separator className="my-6" />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex items-center space-x-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{employee.email}</span>
                </div>
                {employee.phone && (
                  <div className="flex items-center space-x-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{employee.phone}</span>
                  </div>
                )}
                {employee.profile?.hireDate && (
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      Hired: {format(new Date(employee.profile.hireDate), 'MMM d, yyyy')}
                    </span>
                  </div>
                )}
                {employee.profile?.dateOfBirth && (
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      Birthday: {format(new Date(employee.profile.dateOfBirth), 'MMM d')}
                    </span>
                  </div>
                )}
              </div>

              {employee.profile?.notes && (
                <>
                  <Separator className="my-6" />
                  <div>
                    <h3 className="font-medium mb-2">Notes</h3>
                    <p className="text-sm text-muted-foreground">{employee.profile.notes}</p>
                  </div>
                </>
              )}

              {employee.profile?.importantDates && employee.profile.importantDates.length > 0 && (
                <>
                  <Separator className="my-6" />
                  <div>
                    <h3 className="font-medium mb-2">{t('employees.importantDates')}</h3>
                    <div className="space-y-2">
                      {employee.profile.importantDates.map((date, index) => (
                        <div key={index} className="flex justify-between text-sm">
                          <span>{date.label}</span>
                          <span className="text-muted-foreground">
                            {format(new Date(date.date), 'MMM d')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Leave Requests</CardTitle>
            </CardHeader>
            <CardContent>
              {leaveRequests && leaveRequests.length > 0 ? (
                <div className="space-y-3">
                  {leaveRequests.slice(0, 5).map((request) => (
                    <div key={request.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {request.leaveType === 'pto' ? 'PTO' : request.leaveType === 'holiday' ? 'Holiday' : 'Sick'}
                          </Badge>
                          <Badge variant={
                            request.status === 'approved' ? 'default' :
                            request.status === 'denied' ? 'destructive' :
                            'secondary'
                          }>
                            {request.status}
                          </Badge>
                        </div>
                        <span className="text-sm font-medium">{request.totalDays} {request.totalDays === 1 ? 'day' : 'days'}</span>
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
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No leave requests found.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Work Schedule Editor */}
          <ScheduleEditor userId={id} userName={employee.fullName || ''} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CheckSquare className="h-4 w-4 mr-2" />
                Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-700">{pendingTasks}</div>
                  <p className="text-xs text-yellow-600">{t('tasks.pending')}</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-700">{completedTasks}</div>
                  <p className="text-xs text-green-600">{t('tasks.completed')}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="h-4 w-4 mr-2" />
                {t('employees.groups')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {employee.groups.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {employee.groups.map((group) => (
                    <Badge key={group.id} variant="outline" className="text-sm">
                      {group.name}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Not assigned to any groups.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Employee Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('employees.editEmployee')}</DialogTitle>
            <DialogDescription>
              Update employee information
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="fullName">{t('employees.fullName')}</Label>
              <Input
                id="fullName"
                value={editForm.fullName}
                onChange={(e) => setEditForm(prev => ({ ...prev, fullName: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">{t('employees.phone')}</Label>
              <Input
                id="phone"
                value={editForm.phone}
                onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="dateOfBirth">{t('employees.dateOfBirth')}</Label>
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={editForm.dateOfBirth}
                  onChange={(e) => setEditForm(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="hireDate">{t('employees.hireDate')}</Label>
                <Input
                  id="hireDate"
                  type="date"
                  value={editForm.hireDate}
                  onChange={(e) => setEditForm(prev => ({ ...prev, hireDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="emergencyContact">{t('profile.emergencyContact')}</Label>
              <Input
                id="emergencyContact"
                value={editForm.emergencyContact}
                onChange={(e) => setEditForm(prev => ({ ...prev, emergencyContact: e.target.value }))}
                placeholder={t('profile.emergencyContactPlaceholder')}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t('employees.groups')}</Label>
              <div className="flex flex-wrap gap-2 p-3 border rounded-md min-h-[60px]">
                {groups && groups.length > 0 ? (
                  groups.map((group) => (
                    <Badge
                      key={group.id}
                      variant={editForm.groupIds.includes(group.id) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleGroup(group.id)}
                    >
                      {group.name}
                    </Badge>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">{t('descriptions.noGroupsAvailable')}</span>
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={editForm.notes}
                onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
              />
            </div>

            {/* Important Dates Section */}
            <div className="grid gap-2">
              <Label className="flex items-center gap-2">
                <Gift className="h-4 w-4" />
                {t('employees.importantDates')}
              </Label>
              <div className="space-y-2 p-3 border rounded-md">
                {/* Existing dates */}
                {editForm.importantDates.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {editForm.importantDates.map((date, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{date.label}</span>
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(date.date + 'T00:00:00'), 'MMM d')}
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => removeImportantDate(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new date */}
                <div className="flex gap-2">
                  <Input
                    placeholder={t('profile.dateLabelPlaceholder')}
                    value={newDateLabel}
                    onChange={(e) => setNewDateLabel(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="date"
                    value={newDateValue}
                    onChange={(e) => setNewDateValue(e.target.value)}
                    className="w-40"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={addImportantDate}
                    disabled={!newDateLabel || !newDateValue}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Add birthdays, anniversaries, and other dates to track
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateEmployee.isPending}>
              {updateEmployee.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {employee.fullName}? This will permanently remove their account, all task assignments, leave requests, and other data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteEmployee.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
