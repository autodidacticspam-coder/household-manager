'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { DateRange } from '@/types';

type SimpleEmployeeReport = {
  employee: {
    id: string;
    fullName: string;
    email: string;
    avatarUrl: string | null;
  };
  dateRange: DateRange;
  taskStats: {
    total: number;
    completed: number;
    pending: number;
    inProgress: number;
    completionRate: number;
  };
  leaveStats: {
    ptoTaken: number;
    sickTaken: number;
    totalDaysOff: number;
  };
  tasksByCategory: { name: string; count: number }[];
};

export function useTeamStats(dateRange: DateRange) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['team-stats', dateRange],
    queryFn: async () => {
      // Get total staff members (employees + admins)
      const { count: totalEmployees } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .in('role', ['employee', 'admin']);

      // Get staff on leave today
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

      // Get pending tasks (not including recurring tasks from past days)
      const { data: pendingTasks } = await supabase
        .from('tasks')
        .select('id, is_recurring, due_date')
        .in('status', ['pending', 'in_progress']);

      // Filter out recurring tasks from past days
      const filteredPending = (pendingTasks || []).filter((task) => {
        if (!task.is_recurring) return true;
        if (!task.due_date) return true;
        // Include recurring tasks only if due date is today or future
        return task.due_date >= today;
      });

      // Get overdue tasks (exclude recurring tasks from past days)
      const { data: overdueTasks } = await supabase
        .from('tasks')
        .select('id, is_recurring, due_date')
        .in('status', ['pending', 'in_progress'])
        .lt('due_date', today);

      // Filter out recurring tasks for overdue count
      const filteredOverdue = (overdueTasks || []).filter((task) => !task.is_recurring);

      return {
        totalEmployees: totalEmployees || 0,
        activeToday: (totalEmployees || 0) - (onLeaveToday || 0),
        onLeaveToday: onLeaveToday || 0,
        tasksCompleted: tasksCompleted || 0,
        tasksPending: filteredPending.length,
        tasksOverdue: filteredOverdue.length,
      };
    },
  });
}

export function useEmployeeReport(employeeId: string, dateRange: DateRange) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['employee-report', employeeId, dateRange],
    queryFn: async (): Promise<SimpleEmployeeReport> => {
      // Get employee info including role and group memberships
      const { data: employee } = await supabase
        .from('users')
        .select(`
          id, full_name, email, avatar_url, role,
          employee_group_memberships(group_id)
        `)
        .eq('id', employeeId)
        .single();

      const isAdmin = employee?.role === 'admin';
      const employeeGroupIds = (employee?.employee_group_memberships || []).map(
        (m: { group_id: string }) => m.group_id
      );

      // Helper function to check if task is assigned to this employee
      const isTaskAssignedToEmployee = (assignments: { target_type: string; target_user_id: string | null; target_group_id: string | null }[]) => {
        return assignments.some((a) => {
          if (a.target_type === 'all') return true;
          if (a.target_type === 'all_admins' && isAdmin) return true;
          if (a.target_type === 'user' && a.target_user_id === employeeId) return true;
          if (a.target_type === 'group' && a.target_group_id && employeeGroupIds.includes(a.target_group_id)) return true;
          return false;
        });
      };

      // Get tasks - filter by due_date OR completed_at in range
      const { data: tasks } = await supabase
        .from('tasks')
        .select(`
          id,
          status,
          completed_at,
          due_date,
          completed_by,
          assignments:task_assignments(target_user_id, target_type, target_group_id)
        `)
        .or(`due_date.gte.${dateRange.startDate},completed_at.gte.${dateRange.startDate}`)
        .or(`due_date.lte.${dateRange.endDate},completed_at.lte.${dateRange.endDate}`);

      // Filter tasks assigned to this employee
      const employeeTasks = (tasks || []).filter((task) => isTaskAssignedToEmployee(task.assignments));

      // For completed tasks, only count those completed by this employee or assigned to them
      const tasksCompletedByEmployee = employeeTasks.filter((t) =>
        t.status === 'completed' &&
        (t.completed_by === employeeId || !t.completed_by)
      ).length;
      const tasksPending = employeeTasks.filter((t) => t.status === 'pending').length;
      const tasksInProgress = employeeTasks.filter((t) => t.status === 'in_progress').length;
      const totalAssigned = employeeTasks.length;
      const completionRate = totalAssigned > 0
        ? Math.round((tasksCompletedByEmployee / totalAssigned) * 100)
        : 0;

      // Get leave stats - check for any overlap with date range
      const { data: leaveRequests } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('user_id', employeeId)
        .eq('status', 'approved')
        .lte('start_date', dateRange.endDate)
        .gte('end_date', dateRange.startDate);

      const ptoTaken = (leaveRequests || [])
        .filter((r) => r.leave_type === 'pto')
        .reduce((sum, r) => sum + parseFloat(r.total_days || '0'), 0);

      const sickTaken = (leaveRequests || [])
        .filter((r) => r.leave_type === 'sick')
        .reduce((sum, r) => sum + parseFloat(r.total_days || '0'), 0);

      // Get tasks by category - completed by this employee in date range
      const { data: categoryTasks } = await supabase
        .from('tasks')
        .select(`
          category:task_categories(name),
          status,
          completed_by,
          assignments:task_assignments(target_user_id, target_type, target_group_id)
        `)
        .eq('status', 'completed')
        .gte('completed_at', dateRange.startDate)
        .lte('completed_at', dateRange.endDate);

      const tasksByCategory: Record<string, number> = {};
      (categoryTasks || []).forEach((task) => {
        // Only count if assigned to employee OR completed by employee
        const isAssigned = isTaskAssignedToEmployee(task.assignments);
        const completedByEmployee = task.completed_by === employeeId;

        if (isAssigned || completedByEmployee) {
          const categoryObj = Array.isArray(task.category) ? task.category[0] : task.category;
          const categoryName = (categoryObj as { name: string } | null)?.name || 'Uncategorized';
          tasksByCategory[categoryName] = (tasksByCategory[categoryName] || 0) + 1;
        }
      });

      return {
        employee: {
          id: employee?.id || employeeId,
          fullName: employee?.full_name || 'Unknown',
          email: employee?.email || '',
          avatarUrl: employee?.avatar_url || null,
        },
        dateRange,
        taskStats: {
          total: totalAssigned,
          completed: tasksCompletedByEmployee,
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
