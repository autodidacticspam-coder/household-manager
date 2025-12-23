'use client';

import { use } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useEmployee } from '@/hooks/use-employees';
import { useMyLeaveRequests } from '@/hooks/use-leave';
import { useMyTasks } from '@/hooks/use-tasks';
import { format } from 'date-fns';
import { ArrowLeft, Mail, Phone, Calendar, CheckSquare, Users } from 'lucide-react';

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
                    <div key={request.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {request.leaveType === 'pto' ? 'PTO' : 'Sick'}
                          </Badge>
                          <Badge variant={
                            request.status === 'approved' ? 'default' :
                            request.status === 'denied' ? 'destructive' :
                            'secondary'
                          }>
                            {request.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {format(new Date(request.startDate), 'MMM d')} - {format(new Date(request.endDate), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <span className="text-sm font-medium">{request.totalDays} days</span>
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
    </div>
  );
}
