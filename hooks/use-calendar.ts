'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { CalendarEvent } from '@/types';
import { addDays, addWeeks, addMonths, parseISO, isBefore, isAfter, isEqual, getDay, format } from 'date-fns';

export type CalendarFilters = {
  startDate: string;
  endDate: string;
  showTasks?: boolean;
  showLeave?: boolean;
  showSleep?: boolean;
  showFood?: boolean;
  showPoop?: boolean;
  showShower?: boolean;
  showImportantDates?: boolean;
  userId?: string;
};

function expandRecurringTask(
  task: { id: string; due_date: string; recurrence_rule: string },
  rangeStart: Date,
  rangeEnd: Date
): { date: string; instanceId: string }[] {
  const occurrences: { date: string; instanceId: string }[] = [];
  const taskStartDate = parseISO(task.due_date);
  const rule = task.recurrence_rule;
  const freqMatch = rule.match(/FREQ=(\w+)/);
  const byDayMatch = rule.match(/BYDAY=([A-Z,]+)/);
  const intervalMatch = rule.match(/INTERVAL=(\d+)/);
  if (!freqMatch) return occurrences;
  const freq = freqMatch[1];
  const interval = intervalMatch ? parseInt(intervalMatch[1]) : 1;
  const byDays = byDayMatch ? byDayMatch[1].split(',') : null;
  const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const allowedDays = byDays ? byDays.map(d => dayMap[d]) : null;
  let currentDate = taskStartDate;

  // Skip forward to the range start, accounting for interval
  if (isBefore(currentDate, rangeStart)) {
    if (freq === 'DAILY') {
      const daysDiff = Math.ceil((rangeStart.getTime() - taskStartDate.getTime()) / 86400000);
      const periodsToSkip = Math.floor(daysDiff / interval) * interval;
      currentDate = addDays(taskStartDate, periodsToSkip);
    } else if (freq === 'WEEKLY') {
      const weeksDiff = Math.ceil((rangeStart.getTime() - taskStartDate.getTime()) / 604800000);
      const periodsToSkip = Math.floor(weeksDiff / interval) * interval;
      currentDate = addWeeks(taskStartDate, periodsToSkip);
    } else if (freq === 'MONTHLY') {
      const monthsDiff = (rangeStart.getFullYear() - taskStartDate.getFullYear()) * 12 + (rangeStart.getMonth() - taskStartDate.getMonth());
      const periodsToSkip = Math.floor(monthsDiff / interval) * interval;
      currentDate = addMonths(taskStartDate, Math.max(0, periodsToSkip));
    }
  }

  let count = 0;
  while ((isBefore(currentDate, rangeEnd) || isEqual(currentDate, rangeEnd)) && count < 100) {
    if ((isAfter(currentDate, rangeStart) || isEqual(currentDate, rangeStart)) && (isBefore(currentDate, rangeEnd) || isEqual(currentDate, rangeEnd))) {
      if (freq === 'WEEKLY' && allowedDays) {
        // For weekly with BYDAY, check each allowed day in the current week
        for (let i = 0; i < 7; i++) {
          const dayToCheck = addDays(currentDate, i - getDay(currentDate));
          if (allowedDays.includes(getDay(dayToCheck)) &&
              (isAfter(dayToCheck, rangeStart) || isEqual(dayToCheck, rangeStart)) &&
              (isBefore(dayToCheck, rangeEnd) || isEqual(dayToCheck, rangeEnd)) &&
              (isAfter(dayToCheck, taskStartDate) || isEqual(dayToCheck, taskStartDate))) {
            const dateStr = format(dayToCheck, 'yyyy-MM-dd');
            if (!occurrences.find(o => o.date === dateStr)) {
              occurrences.push({ date: dateStr, instanceId: task.id + '-' + dateStr });
            }
          }
        }
      } else {
        occurrences.push({ date: format(currentDate, 'yyyy-MM-dd'), instanceId: task.id + '-' + format(currentDate, 'yyyy-MM-dd') });
      }
    }
    // Advance by interval
    if (freq === 'DAILY') currentDate = addDays(currentDate, interval);
    else if (freq === 'WEEKLY') currentDate = addWeeks(currentDate, interval);
    else if (freq === 'MONTHLY') currentDate = addMonths(currentDate, interval);
    else break;
    count++;
  }
  return occurrences;
}

function formatAssignees(assignments: Array<{ target_type: string; user?: { full_name: string } | null; group?: { name: string } | null }>): string[] {
  return assignments.map(a => {
    if (a.target_type === 'all') return 'All Employees';
    if (a.target_type === 'all_admins') return 'All Admins';
    if (a.target_type === 'user' && a.user) return a.user.full_name;
    if (a.target_type === 'group' && a.group) return a.group.name + ' (Group)';
    return '';
  }).filter(Boolean);
}

export function useCalendarEvents(filters: CalendarFilters) {
  const supabase = createClient();
  return useQuery({
    queryKey: ['calendar-events', filters],
    queryFn: async () => {
      const events: CalendarEvent[] = [];
      const rangeStart = parseISO(filters.startDate);
      const rangeEnd = parseISO(filters.endDate);
      if (filters.showTasks !== false) {
        const { data: regularTasks, error: regularError } = await supabase.from('tasks').select('*, category:task_categories(name, color), assignments:task_assignments(target_type, target_user_id, target_group_id, user:users(full_name), group:employee_groups(name))').eq('is_recurring', false).gte('due_date', filters.startDate).lte('due_date', filters.endDate);
        if (regularError) throw regularError;
        const { data: recurringTasks, error: recurringError } = await supabase.from('tasks').select('*, category:task_categories(name, color), assignments:task_assignments(target_type, target_user_id, target_group_id, user:users(full_name), group:employee_groups(name))').eq('is_recurring', true).lte('due_date', filters.endDate);
        if (recurringError) throw recurringError;
        for (const task of [...(regularTasks || []), ...(recurringTasks || [])]) {
          if (!task.due_date) continue;
          if (filters.userId && !task.assignments.some((a: { target_type: string; target_user_id: string }) => a.target_type === 'all' || (a.target_type === 'user' && a.target_user_id === filters.userId))) continue;
          const assignees = formatAssignees(task.assignments);

          // Calculate start and end times based on activity mode
          const getEventTimes = (date: string) => {
            if (task.is_all_day) {
              return { start: date, end: date };
            }
            if (task.is_activity && task.start_time && task.end_time) {
              return {
                start: date + 'T' + task.start_time,
                end: date + 'T' + task.end_time
              };
            }
            // Regular task with due time
            return {
              start: date + 'T' + (task.due_time || '09:00'),
              end: date + 'T' + (task.due_time || '10:00')
            };
          };

          if (task.is_recurring && task.recurrence_rule) {
            for (const o of expandRecurringTask(task, rangeStart, rangeEnd)) {
              const times = getEventTimes(o.date);
              events.push({ id: 'task-' + o.instanceId, type: 'task', title: task.title, start: times.start, end: times.end, allDay: task.is_all_day, color: task.category?.color || '#6366f1', resourceId: task.id, extendedProps: { status: task.status, priority: task.priority, category: task.category?.name, isRecurring: true, isActivity: task.is_activity, assignees } });
            }
          } else {
            const times = getEventTimes(task.due_date);
            events.push({ id: 'task-' + task.id, type: 'task', title: task.title, start: times.start, end: times.end, allDay: task.is_all_day, color: task.category?.color || '#6366f1', resourceId: task.id, extendedProps: { status: task.status, priority: task.priority, category: task.category?.name, isActivity: task.is_activity, assignees } });
          }
        }
      }
      if (filters.showLeave !== false) {
        let q = supabase.from('leave_requests').select('*, user:users!leave_requests_user_id_fkey(id, full_name)').eq('status', 'approved').or('start_date.lte.' + filters.endDate + ',end_date.gte.' + filters.startDate);
        if (filters.userId) q = q.eq('user_id', filters.userId);
        const { data: leaves, error } = await q;
        if (error) throw error;
        for (const l of leaves || []) {
          events.push({ id: 'leave-' + l.id, type: 'leave', title: ((l.user as any)?.full_name || 'Employee') + ' - ' + (l.leave_type === 'pto' ? 'PTO' : 'Sick'), start: l.start_date, end: l.end_date, allDay: true, color: l.leave_type === 'pto' ? '#3b82f6' : '#10b981', resourceId: l.id, extendedProps: { leaveType: l.leave_type, userId: l.user_id, userName: (l.user as any)?.full_name, totalDays: l.total_days } });
        }
      }

      // Fetch child logs
      const showAnyLogs = filters.showSleep !== false || filters.showFood !== false || filters.showPoop !== false || filters.showShower !== false;
      if (showAnyLogs) {
        const categoryFilters: string[] = [];
        if (filters.showSleep !== false) categoryFilters.push('sleep');
        if (filters.showFood !== false) categoryFilters.push('food');
        if (filters.showPoop !== false) categoryFilters.push('poop');
        if (filters.showShower !== false) categoryFilters.push('shower');

        const { data: childLogs, error: logsError } = await supabase
          .from('child_logs')
          .select('*, logged_by_user:users!child_logs_logged_by_fkey(full_name)')
          .gte('log_date', filters.startDate)
          .lte('log_date', filters.endDate)
          .in('category', categoryFilters);

        if (logsError) throw logsError;

        const logColors: Record<string, string> = {
          sleep: '#6366f1', // indigo
          food: '#f97316', // orange
          poop: '#d97706', // amber
          shower: '#06b6d4', // cyan
        };

        const logEmojis: Record<string, string> = {
          sleep: '💤',
          food: '🍽️',
          poop: '💩',
          shower: '🚿',
        };

        for (const log of childLogs || []) {
          const emoji = logEmojis[log.category] || '';
          const title = `${emoji} ${log.child} - ${log.category.charAt(0).toUpperCase() + log.category.slice(1)}`;

          // For sleep, use start_time and end_time if available
          let eventStart = log.log_date + 'T' + log.log_time;
          let eventEnd = log.log_date + 'T' + log.log_time;

          if (log.category === 'sleep' && log.start_time && log.end_time) {
            eventStart = log.log_date + 'T' + log.start_time;
            eventEnd = log.log_date + 'T' + log.end_time;
          }

          events.push({
            id: 'log-' + log.id,
            type: 'log' as any,
            title,
            start: eventStart,
            end: eventEnd,
            allDay: false,
            color: logColors[log.category] || '#6b7280',
            resourceId: log.id,
            extendedProps: {
              logCategory: log.category,
              child: log.child,
              description: log.description,
              loggedBy: (log.logged_by_user as any)?.full_name,
              startTime: log.start_time,
              endTime: log.end_time,
            },
          });
        }
      }

      // Fetch important dates (admin only, recurring yearly)
      if (filters.showImportantDates !== false && !filters.userId) {
        const { data: profiles, error: profilesError } = await supabase
          .from('employee_profiles')
          .select(`
            important_dates,
            user:users!employee_profiles_user_id_fkey(id, full_name)
          `)
          .not('important_dates', 'is', null);

        if (profilesError) throw profilesError;

        for (const profile of profiles || []) {
          // Handle Supabase join - user may be an array or a single object
          const rawUser = profile.user;
          const user = Array.isArray(rawUser) ? rawUser[0] : rawUser as { id: string; full_name: string } | null;
          const dates = profile.important_dates as { label: string; date: string }[] | null;

          if (user && dates && Array.isArray(dates)) {
            for (const d of dates) {
              // Get month and day from the stored date
              const [, month, day] = d.date.split('-').map(Number);

              // Check if this date occurs within the filter range (for this year)
              const rangeStartYear = rangeStart.getFullYear();
              const rangeEndYear = rangeEnd.getFullYear();

              // Check for occurrences in both the start and end year of the range
              for (let year = rangeStartYear; year <= rangeEndYear; year++) {
                const eventDate = new Date(year, month - 1, day);
                const eventDateStr = format(eventDate, 'yyyy-MM-dd');

                if ((isAfter(eventDate, rangeStart) || isEqual(eventDate, rangeStart)) &&
                    (isBefore(eventDate, rangeEnd) || isEqual(eventDate, rangeEnd))) {
                  events.push({
                    id: `important-${user.id}-${d.date}-${year}`,
                    type: 'important_date' as any,
                    title: `🎂 ${d.label} (${user.full_name})`,
                    start: eventDateStr,
                    end: eventDateStr,
                    allDay: true,
                    color: '#ec4899', // pink
                    resourceId: user.id,
                    extendedProps: {
                      label: d.label,
                      employeeName: user.full_name,
                      employeeId: user.id,
                      originalDate: d.date,
                    },
                  });
                }
              }
            }
          }
        }
      }

      return events;
    },
  });
}
