'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { DateRange, EmployeeReport } from '@/types';

export function useTeamStats(dateRange: DateRange) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['team-stats', dateRange],
    queryFn: async () => {
      // Get total employees
      const { count: totalEmployees } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role', 'employee');

      // Get employees on leave today
      const today = new Date().toISOString().split('T')[0];
      const { count: onLeaveToday } = await supabase
        .from('leave_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved')
        .lte('start_date', today)
        .gte('end_date', today);

      // Get tasks completed in date range
      const { count: tasksCompleted } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('completed_at', dateRange.startDate)
        .lte('completed_at', dateRange.endDate);

      // Get pending tasks
      const { count: tasksPending } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'in_progress']);

      // Get overdue tasks
      const { count: tasksOverdue } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'in_progress'])
        .lt('due_date', today);

      return {
        totalEmployees: totalEmployees || 0,
        activeToday: (totalEmployees || 0) - (onLeaveToday || 0),
        onLeaveToday: onLeaveToday || 0,
        tasksCompleted: tasksCompleted || 0,
        tasksPending: tasksPending || 0,
        tasksOverdue: tasksOverdue || 0,
      };
    },
  });
}

export function useEmployeeReport(employeeId: string, dateRange: DateRange) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['employee-report', employeeId, dateRange],
    queryFn: async (): Promise<EmployeeReport> => {
      // Get employee info
      const { data: employee } = await supabase
        .from('users')
        .select('id, full_name, email, avatar_url')
        .eq('id', employeeId)
        .single();

      // Get tasks stats
      const { data: tasks } = await supabase
        .from('tasks')
        .select(`
          id,
          status,
          completed_at,
          created_at,
          assignments:task_assignments(target_user_id, target_type)
        `)
        .gte('created_at', dateRange.startDate)
        .lte('created_at', dateRange.endDate);

      // Filter tasks assigned to this employee
      const employeeTasks = (tasks || []).filter((task) => {
        return task.assignments.some((a: { target_type: string; target_user_id: string }) =>
          a.target_type === 'all' || a.target_user_id === employeeId
        );
      });

      const tasksCompleted = employeeTasks.filter((t) => t.status === 'completed').length;
      const tasksPending = employeeTasks.filter((t) => t.status === 'pending').length;
      const tasksInProgress = employeeTasks.filter((t) => t.status === 'in_progress').length;
      const completionRate = employeeTasks.length > 0
        ? Math.round((tasksCompleted / employeeTasks.length) * 100)
        : 0;

      // Get leave stats
      const { data: leaveRequests } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('user_id', employeeId)
        .eq('status', 'approved')
        .gte('start_date', dateRange.startDate)
        .lte('end_date', dateRange.endDate);

      const ptoTaken = (leaveRequests || [])
        .filter((r) => r.leave_type === 'pto')
        .reduce((sum, r) => sum + parseFloat(r.total_days), 0);

      const sickTaken = (leaveRequests || [])
        .filter((r) => r.leave_type === 'sick')
        .reduce((sum, r) => sum + parseFloat(r.total_days), 0);

      // Get tasks by category
      const { data: categoryTasks } = await supabase
        .from('tasks')
        .select(`
          category:task_categories(name),
          status,
          assignments:task_assignments(target_user_id, target_type)
        `)
        .eq('status', 'completed')
        .gte('completed_at', dateRange.startDate)
        .lte('completed_at', dateRange.endDate);

      const tasksByCategory: Record<string, number> = {};
      (categoryTasks || []).forEach((task) => {
        const isAssigned = task.assignments.some((a: { target_type: string; target_user_id: string }) =>
          a.target_type === 'all' || a.target_user_id === employeeId
        );
        if (isAssigned) {
          const categoryName = (task.category as { name: string })?.name || 'Other';
          tasksByCategory[categoryName] = (tasksByCategory[categoryName] || 0) + 1;
        }
      });

      return {
        employee: {
          id: employee?.id || employeeId,
          fullName: employee?.full_name || 'Unknown',
          email: employee?.email || '',
          avatarUrl: employee?.avatar_url,
        },
        dateRange,
        taskStats: {
          total: employeeTasks.length,
          completed: tasksCompleted,
          pending: tasksPending,
          inProgress: tasksInProgress,
          completionRate,
        },
        leaveStats: {
          ptoTaken,
          sickTaken,
          totalDaysOff: ptoTaken + sickTaken,
        },
        tasksByCategory: Object.entries(tasksByCategory).map(([name, count]) => ({
          name,
          count,
        })),
      };
    },
    enabled: !!employeeId,
  });
}

export function useTaskCompletionTrend(dateRange: DateRange) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['task-completion-trend', dateRange],
    queryFn: async () => {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('completed_at')
        .eq('status', 'completed')
        .gte('completed_at', dateRange.startDate)
        .lte('completed_at', dateRange.endDate)
        .order('completed_at');

      // Group by date
      const byDate: Record<string, number> = {};
      (tasks || []).forEach((task) => {
        if (task.completed_at) {
          const date = task.completed_at.split('T')[0];
          byDate[date] = (byDate[date] || 0) + 1;
        }
      });

      return Object.entries(byDate).map(([date, count]) => ({
        date,
        count,
      }));
    },
  });
}
