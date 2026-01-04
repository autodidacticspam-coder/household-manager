'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { format, subDays } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DateRangePicker } from '@/components/shared/date-range-picker';
import { useTeamStats, useEmployeeReport, useTaskCompletionTrend } from '@/hooks/use-reports';
import { useEmployeesList } from '@/hooks/use-employees';
import type { DateRange } from '@/types';
import {
  Users,
  CheckSquare,
  Clock,
  AlertCircle,
  TrendingUp,
  Calendar,
  Download,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const COLORS = ['#6366f1', '#ec4899', '#3b82f6', '#f97316', '#10b981', '#8b5cf6', '#06b6d4', '#eab308'];

export default function ReportsPage() {
  const t = useTranslations();
  const today = new Date();
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: format(subDays(today, 29), 'yyyy-MM-dd'),
    endDate: format(today, 'yyyy-MM-dd'),
    preset: 'last30days',
  });
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');

  const { data: employees, isLoading: employeesLoading } = useEmployeesList();
  const { data: teamStats, isLoading: teamStatsLoading } = useTeamStats(dateRange);
  const { data: employeeReport, isLoading: reportLoading } = useEmployeeReport(selectedEmployeeId, dateRange);
  const { data: completionTrend } = useTaskCompletionTrend(dateRange);

  const handleExportCSV = () => {
    if (!employeeReport) return;

    const rows = [
      ['Employee Report'],
      ['Name', employeeReport.employee.fullName],
      ['Email', employeeReport.employee.email],
      ['Date Range', `${dateRange.startDate} to ${dateRange.endDate}`],
      [],
      ['Task Statistics'],
      ['Total Tasks', employeeReport.taskStats.total.toString()],
      ['Completed', employeeReport.taskStats.completed.toString()],
      ['Pending', employeeReport.taskStats.pending.toString()],
      ['Completion Rate', `${employeeReport.taskStats.completionRate}%`],
      [],
      ['Leave Statistics'],
      ['Vacation Taken', employeeReport.leaveStats.ptoTaken.toString()],
      ['Sick Days Taken', employeeReport.leaveStats.sickTaken.toString()],
      ['Total Days Off', employeeReport.leaveStats.totalDaysOff.toString()],
    ];

    const csvContent = rows.map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employee-report-${employeeReport.employee.fullName.replace(/\s+/g, '-')}-${dateRange.startDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('reports.title')}</h1>
          <p className="text-muted-foreground">
            {t('descriptions.reports')}
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Team Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('reports.stats.totalEmployees')}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {teamStatsLoading ? <Skeleton className="h-8 w-12" /> : teamStats?.totalEmployees}
            </div>
            <p className="text-xs text-muted-foreground">
              {teamStats?.activeToday} {t('reports.stats.activeToday').toLowerCase()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('reports.stats.tasksCompleted')}
            </CardTitle>
            <CheckSquare className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {teamStatsLoading ? <Skeleton className="h-8 w-12" /> : teamStats?.tasksCompleted}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('reports.inSelectedPeriod')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('reports.stats.tasksPending')}
            </CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {teamStatsLoading ? <Skeleton className="h-8 w-12" /> : teamStats?.tasksPending}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('reports.awaitingCompletion')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('reports.stats.tasksOverdue')}
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {teamStatsLoading ? <Skeleton className="h-8 w-12" /> : teamStats?.tasksOverdue}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('reports.needsAttention')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Task Completion Trend Chart */}
      {completionTrend && completionTrend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-4 w-4 mr-2" />
              {t('reports.charts.completionTrend')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={completionTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(value) => format(new Date(value), 'MMM d')}
                  />
                  <YAxis />
                  <Tooltip
                    labelFormatter={(value) => format(new Date(value), 'MMM d, yyyy')}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Employee Report Section */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>{t('reports.employeeReports')}</CardTitle>
            <div className="flex items-center gap-3">
              <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder={t('reports.selectEmployee')} />
                </SelectTrigger>
                <SelectContent>
                  {employees?.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      <div className="flex items-center">
                        <Avatar className="h-5 w-5 mr-2">
                          <AvatarImage src={employee.avatarUrl || undefined} />
                          <AvatarFallback className="text-xs">
                            {employee.fullName?.[0]}
                          </AvatarFallback>
                        </Avatar>
                        {employee.fullName}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {employeeReport && (
                <Button variant="outline" size="sm" onClick={handleExportCSV}>
                  <Download className="h-4 w-4 mr-2" />
                  {t('reports.exportCSV')}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedEmployeeId ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('reports.selectEmployee')}
            </div>
          ) : reportLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32" />
              <Skeleton className="h-64" />
            </div>
          ) : employeeReport ? (
            <div className="space-y-6">
              {/* Employee Info */}
              <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={employeeReport.employee.avatarUrl || undefined} />
                  <AvatarFallback className="text-lg">
                    {employeeReport.employee.fullName?.[0]}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold">{employeeReport.employee.fullName}</h3>
                  <p className="text-sm text-muted-foreground">{employeeReport.employee.email}</p>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="p-4 bg-indigo-50 rounded-lg">
                  <p className="text-sm text-indigo-600 font-medium">{t('reports.stats.tasksCompleted')}</p>
                  <p className="text-2xl font-bold text-indigo-700">{employeeReport.taskStats.completed}</p>
                  <p className="text-xs text-indigo-500">of {employeeReport.taskStats.total} total</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-600 font-medium">{t('reports.stats.completionRate')}</p>
                  <p className="text-2xl font-bold text-green-700">{employeeReport.taskStats.completionRate}%</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-600 font-medium">{t('reports.ptoTaken')}</p>
                  <p className="text-2xl font-bold text-blue-700">{employeeReport.leaveStats.ptoTaken}</p>
                  <p className="text-xs text-blue-500">{t('common.days')}</p>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg">
                  <p className="text-sm text-orange-600 font-medium">{t('reports.sickDays')}</p>
                  <p className="text-2xl font-bold text-orange-700">{employeeReport.leaveStats.sickTaken}</p>
                  <p className="text-xs text-orange-500">{t('common.days')}</p>
                </div>
              </div>

              {/* Tasks by Category Chart */}
              {employeeReport.tasksByCategory.length > 0 && (
                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">{t('reports.charts.byCategory')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={employeeReport.tasksByCategory as unknown as Record<string, unknown>[]}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="count" fill="#6366f1" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">{t('reports.taskDistribution')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={employeeReport.tasksByCategory as unknown as Record<string, unknown>[]}
                              dataKey="count"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={60}
                              label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                            >
                              {employeeReport.tasksByCategory.map((_, index) => (
                                <Cell key={index} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
