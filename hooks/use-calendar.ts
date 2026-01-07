'use client';

import { useQuery } from '@tanstack/react-query';
import { parseLocalDate } from '@/lib/date-utils';
import { createClient } from '@/lib/supabase/client';
import type { CalendarEvent } from '@/types';
import { addDays, addWeeks, addMonths, isBefore, isAfter, isEqual, getDay, format } from 'date-fns';

// Type for Supabase user join results
type UserJoinResult = { id: string; full_name: string; avatar_url?: string | null } | null;

// Helper to safely extract user from Supabase join (handles array or single object)
function extractUser(rawUser: unknown): UserJoinResult {
  if (!rawUser) return null;
  if (Array.isArray(rawUser)) return rawUser[0] as UserJoinResult;
  return rawUser as UserJoinResult;
}


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
  showSchedules?: boolean;
  userId?: string;
};

function expandRecurringTask(
  task: { id: string; due_date: string; recurrence_rule: string },
  rangeStart: Date,
  rangeEnd: Date
): { date: string; instanceId: string }[] {
  const occurrences: { date: string; instanceId: string }[] = [];
  const taskStartDate = parseLocalDate(task.due_date);
  const rule = task.recurrence_rule;
  const freqMatch = rule.match(/FREQ=(\w+)/);
  const byDayMatch = rule.match(/BYDAY=([A-Z,]+)/);
  const intervalMatch = rule.match(/INTERVAL=(\d+)/);
  if (!freqMatch) return occurrences;
  const freq = freqMatch[1];
  const interval = intervalMatch ? parseInt(intervalMatch[1], 10) : 1;
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
      const rangeStart = parseLocalDate(filters.startDate);
      const rangeEnd = parseLocalDate(filters.endDate);

      // If filtering by user, get their group memberships and role
      let userGroupIds: string[] = [];
      let isUserAdmin = false;
      if (filters.userId) {
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', filters.userId)
          .single();
        isUserAdmin = userData?.role === 'admin';

        const { data: userGroups } = await supabase
          .from('employee_group_memberships')
          .select('group_id')
          .eq('user_id', filters.userId);
        userGroupIds = (userGroups || []).map(g => g.group_id);
      }

      if (filters.showTasks !== false) {
        const { data: regularTasks, error: regularError } = await supabase.from('tasks').select('*, category:task_categories(name, color), assignments:task_assignments(target_type, target_user_id, target_group_id, user:users(full_name), group:employee_groups(name)), viewers:task_viewers(target_type, target_user_id, target_group_id)').eq('is_recurring', false).gte('due_date', filters.startDate).lte('due_date', filters.endDate);
        if (regularError) throw regularError;
        const { data: recurringTasks, error: recurringError } = await supabase.from('tasks').select('*, category:task_categories(name, color), assignments:task_assignments(target_type, target_user_id, target_group_id, user:users(full_name), group:employee_groups(name)), viewers:task_viewers(target_type, target_user_id, target_group_id)').eq('is_recurring', true).lte('due_date', filters.endDate);
        if (recurringError) throw recurringError;

        // Fetch task completions for the date range
        const { data: taskCompletions, error: completionsError } = await supabase
          .from('task_completions')
          .select('task_id, completion_date')
          .gte('completion_date', filters.startDate)
          .lte('completion_date', filters.endDate);
        if (completionsError) throw completionsError;

        // Fetch task skipped instances for the date range
        const { data: skippedInstances, error: skippedError } = await supabase
          .from('task_skipped_instances')
          .select('task_id, skipped_date')
          .gte('skipped_date', filters.startDate)
          .lte('skipped_date', filters.endDate);
        if (skippedError) console.error('Error fetching skipped instances:', skippedError);

        // Fetch task instance time overrides for the date range
        const { data: instanceOverrides, error: overridesError } = await supabase
          .from('task_instance_overrides')
          .select('task_id, instance_date, override_time, override_start_time, override_end_time')
          .gte('instance_date', filters.startDate)
          .lte('instance_date', filters.endDate);
        if (overridesError) console.error('Error fetching instance overrides:', overridesError);

        // Create a Set for fast lookup of completed task instances
        const completedInstancesSet = new Set<string>();
        for (const completion of taskCompletions || []) {
          completedInstancesSet.add(`${completion.task_id}-${completion.completion_date}`);
        }

        // Create a Set for fast lookup of skipped task instances
        const skippedInstancesSet = new Set<string>();
        for (const skip of skippedInstances || []) {
          skippedInstancesSet.add(`${skip.task_id}-${skip.skipped_date}`);
        }

        // Create a Map for time overrides
        const timeOverridesMap = new Map<string, { overrideTime: string | null; overrideStartTime: string | null; overrideEndTime: string | null }>();
        for (const override of instanceOverrides || []) {
          timeOverridesMap.set(`${override.task_id}-${override.instance_date}`, {
            overrideTime: override.override_time,
            overrideStartTime: override.override_start_time,
            overrideEndTime: override.override_end_time,
          });
        }

        for (const task of [...(regularTasks || []), ...(recurringTasks || [])]) {
          if (!task.due_date) continue;

          // Check if user is assigned to this task
          const isUserAssigned = !filters.userId || task.assignments.some((a: { target_type: string; target_user_id: string; target_group_id: string }) => {
            if (a.target_type === 'all') return true;
            if (a.target_type === 'all_admins' && isUserAdmin) return true;
            if (a.target_type === 'user' && a.target_user_id === filters.userId) return true;
            if (a.target_type === 'group' && userGroupIds.includes(a.target_group_id)) return true;
            return false;
          });

          // Check if user is a viewer of this task
          const isUserViewer = filters.userId && (task.viewers || []).some((v: { target_type: string; target_user_id: string; target_group_id: string }) => {
            if (v.target_type === 'all') return true;
            if (v.target_type === 'all_admins' && isUserAdmin) return true;
            if (v.target_type === 'user' && v.target_user_id === filters.userId) return true;
            if (v.target_type === 'group' && userGroupIds.includes(v.target_group_id)) return true;
            return false;
          });

          // Skip if user is neither assigned nor a viewer
          if (filters.userId && !isUserAssigned && !isUserViewer) continue;

          // Mark as view-only if user is only a viewer (not assigned)
          const isViewOnly = filters.userId && !isUserAssigned && isUserViewer;

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
              const instanceKey = `${task.id}-${o.date}`;

              // Skip this instance if it was skipped
              if (skippedInstancesSet.has(instanceKey)) {
                continue;
              }

              // Check for time override
              const timeOverride = timeOverridesMap.get(instanceKey);
              let times = getEventTimes(o.date);

              // Apply time override if exists
              if (timeOverride) {
                if (task.is_activity && timeOverride.overrideStartTime && timeOverride.overrideEndTime) {
                  times = {
                    start: o.date + 'T' + timeOverride.overrideStartTime,
                    end: o.date + 'T' + timeOverride.overrideEndTime
                  };
                } else if (timeOverride.overrideTime) {
                  times = {
                    start: o.date + 'T' + timeOverride.overrideTime,
                    end: o.date + 'T' + timeOverride.overrideTime
                  };
                }
              }

              // Check if this specific instance has been completed
              const instanceStatus = completedInstancesSet.has(instanceKey) ? 'completed' : 'pending';
              events.push({
                id: 'task-' + o.instanceId,
                type: 'task',
                title: task.title,
                start: times.start,
                end: times.end,
                allDay: task.is_all_day,
                color: task.category?.color || '#60a5fa',
                resourceId: task.id,
                extendedProps: {
                  status: instanceStatus,
                  priority: task.priority,
                  category: task.category?.name,
                  isRecurring: true,
                  isActivity: task.is_activity,
                  isViewOnly,
                  assignees,
                  instanceDate: o.date,
                  hasTimeOverride: !!timeOverride,
                  originalDueTime: task.due_time,
                  originalStartTime: task.start_time,
                  originalEndTime: task.end_time,
                }
              });
            }
          } else {
            const times = getEventTimes(task.due_date);
            events.push({ id: 'task-' + task.id, type: 'task', title: task.title, start: times.start, end: times.end, allDay: task.is_all_day, color: task.category?.color || '#60a5fa', resourceId: task.id, extendedProps: { status: task.status, priority: task.priority, category: task.category?.name, isActivity: task.is_activity, isViewOnly, assignees } });
          }
        }
      }
      if (filters.showLeave !== false) {
        let q = supabase.from('leave_requests').select('*, user:users!leave_requests_user_id_fkey(id, full_name)').eq('status', 'approved').or('start_date.lte.' + filters.endDate + ',end_date.gte.' + filters.startDate);
        if (filters.userId) q = q.eq('user_id', filters.userId);
        const { data: leaves, error } = await q;
        if (error) throw error;
        for (const l of leaves || []) {
          // Check if this is a holiday (by leave_type or reason)
          const isHoliday = l.leave_type === 'holiday' || l.reason?.startsWith('Holiday:') || false;
          const holidayName = isHoliday && l.reason ? l.reason.replace('Holiday: ', '') : null;
          const leaveUser = extractUser(l.user);

          // Determine display type and color
          let displayType: string;
          let color: string;
          if (isHoliday) {
            displayType = 'Holiday';
            color = '#fbbf24'; // soft gold for holidays
          } else if (l.leave_type === 'vacation' || l.leave_type === 'pto') {
            displayType = 'Vacation';
            color = '#67e8f9'; // soft cyan for vacation
          } else {
            displayType = 'Sick';
            color = '#fca5a5'; // soft coral for sick
          }

          const title = isHoliday
            ? `${leaveUser?.full_name || 'Employee'} - ${holidayName}`
            : `${leaveUser?.full_name || 'Employee'} - ${displayType}`;

          const baseEventProps = {
            type: 'leave' as const,
            title,
            allDay: true,
            color,
            resourceId: l.id,
            extendedProps: {
              leaveType: isHoliday ? 'holiday' : l.leave_type,
              userId: l.user_id,
              userName: leaveUser?.full_name,
              totalDays: l.total_days,
              isHoliday,
              holidayName,
            }
          };

          // Use selected_dates if available for accurate display of non-contiguous dates
          if (l.selected_dates && Array.isArray(l.selected_dates) && l.selected_dates.length > 0) {
            // Group consecutive dates into ranges for cleaner display
            const sortedDates = [...l.selected_dates].sort();
            let rangeStart = sortedDates[0];
            let rangeEnd = sortedDates[0];

            for (let i = 1; i <= sortedDates.length; i++) {
              const currentDate = sortedDates[i];
              const prevDate = sortedDates[i - 1];

              // Check if current date is consecutive (next day after previous)
              const isConsecutive = currentDate &&
                format(addDays(parseLocalDate(prevDate), 1), 'yyyy-MM-dd') === currentDate;

              if (isConsecutive) {
                rangeEnd = currentDate;
              } else {
                // End of a range, create event
                // FullCalendar treats end date as exclusive, so add 1 day
                const endDatePlusOne = format(addDays(parseLocalDate(rangeEnd), 1), 'yyyy-MM-dd');
                events.push({
                  id: `leave-${l.id}-${rangeStart}`,
                  ...baseEventProps,
                  start: rangeStart,
                  end: endDatePlusOne,
                });

                // Start new range if there are more dates
                if (currentDate) {
                  rangeStart = currentDate;
                  rangeEnd = currentDate;
                }
              }
            }
          } else {
            // Fallback to start_date/end_date range
            // FullCalendar treats end date as exclusive for all-day events
            // So we need to add 1 day to include the actual end date
            const endDatePlusOne = format(addDays(parseLocalDate(l.end_date), 1), 'yyyy-MM-dd');

            events.push({
              id: 'leave-' + l.id,
              ...baseEventProps,
              start: l.start_date,
              end: endDatePlusOne,
            });
          }
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
          sleep: '#c4b5fd', // lavender
          food: '#fdba74', // peach
          poop: '#d6d3d1', // tan
          shower: '#6ee7b7', // mint
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
          const loggedByUser = extractUser(log.logged_by_user);

          // For sleep, use start_time and end_time if available
          let eventStart = log.log_date + 'T' + log.log_time;
          let eventEnd = log.log_date + 'T' + log.log_time;

          if (log.category === 'sleep' && log.start_time && log.end_time) {
            eventStart = log.log_date + 'T' + log.start_time;
            eventEnd = log.log_date + 'T' + log.end_time;
          }

          events.push({
            id: 'log-' + log.id,
            type: 'log',
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
              loggedBy: loggedByUser?.full_name,
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
                    type: 'important_date',
                    title: `🎂 ${d.label} (${user.full_name})`,
                    start: eventDateStr,
                    end: eventDateStr,
                    allDay: true,
                    color: '#f9a8d4', // soft pink
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

      // Fetch work schedules (recurring weekly)
      if (filters.showSchedules !== false) {
        let scheduleQuery = supabase
          .from('employee_schedules')
          .select(`
            *,
            user:users!employee_schedules_user_id_fkey(id, full_name, avatar_url)
          `)
          .eq('is_active', true);

        if (filters.userId) {
          scheduleQuery = scheduleQuery.eq('user_id', filters.userId);
        }

        const { data: schedules, error: schedulesError } = await scheduleQuery;

        if (schedulesError) throw schedulesError;

        // Fetch schedule overrides for the date range
        const { data: overrides, error: overridesError } = await supabase
          .from('schedule_overrides')
          .select('*')
          .gte('override_date', filters.startDate)
          .lte('override_date', filters.endDate);

        if (overridesError) throw overridesError;

        // Create a map of overrides by schedule_id and date for quick lookup
        const overrideMap = new Map<string, { start_time: string | null; end_time: string | null; is_cancelled: boolean; notes: string | null }>();
        for (const override of overrides || []) {
          const key = `${override.schedule_id}-${override.override_date}`;
          overrideMap.set(key, {
            start_time: override.start_time,
            end_time: override.end_time,
            is_cancelled: override.is_cancelled,
            notes: override.notes,
          });
        }

        // Fetch approved leave requests to exclude schedule on days off
        const { data: approvedLeaves } = await supabase
          .from('leave_requests')
          .select('user_id, start_date, end_date, selected_dates')
          .eq('status', 'approved')
          .or(`start_date.lte.${filters.endDate},end_date.gte.${filters.startDate}`);

        // Create a Set of "userId-date" for days with approved leave
        const leaveDaysSet = new Set<string>();
        for (const leave of approvedLeaves || []) {
          // Use selected_dates if available, otherwise generate from range
          if (leave.selected_dates && Array.isArray(leave.selected_dates)) {
            for (const dateStr of leave.selected_dates) {
              leaveDaysSet.add(`${leave.user_id}-${dateStr}`);
            }
          } else {
            // Generate dates from start_date to end_date
            let leaveDate = parseLocalDate(leave.start_date);
            const leaveEnd = parseLocalDate(leave.end_date);
            while (isBefore(leaveDate, leaveEnd) || isEqual(leaveDate, leaveEnd)) {
              leaveDaysSet.add(`${leave.user_id}-${format(leaveDate, 'yyyy-MM-dd')}`);
              leaveDate = addDays(leaveDate, 1);
            }
          }
        }

        // Generate schedule events for each day in the range
        for (const schedule of schedules || []) {
          const user = schedule.user as { id: string; full_name: string; avatar_url: string | null } | null;
          if (!user) continue;

          // Iterate through each day in the range
          let currentDate = new Date(rangeStart);
          while (isBefore(currentDate, rangeEnd) || isEqual(currentDate, rangeEnd)) {
            // Check if the current day matches the schedule's day of week
            if (getDay(currentDate) === schedule.day_of_week) {
              const dateStr = format(currentDate, 'yyyy-MM-dd');

              // Skip if employee has approved leave for this day
              if (leaveDaysSet.has(`${schedule.user_id}-${dateStr}`)) {
                currentDate = addDays(currentDate, 1);
                continue;
              }

              const overrideKey = `${schedule.id}-${dateStr}`;
              const override = overrideMap.get(overrideKey);

              // Skip cancelled schedules
              if (override?.is_cancelled) {
                currentDate = addDays(currentDate, 1);
                continue;
              }

              // Use override times if available, otherwise use regular schedule
              const startTime = override?.start_time || schedule.start_time;
              const endTime = override?.end_time || schedule.end_time;
              const hasOverride = !!override;

              events.push({
                id: `schedule-${schedule.id}-${dateStr}`,
                type: 'schedule',
                title: `${user.full_name}`,
                start: `${dateStr}T${startTime}`,
                end: `${dateStr}T${endTime}`,
                allDay: false,
                color: '#94a3b8', // soft gray for schedules
                resourceId: schedule.id,
                extendedProps: {
                  scheduleId: schedule.id,
                  scheduleDate: dateStr,
                  userId: schedule.user_id,
                  userName: user.full_name,
                  avatarUrl: user.avatar_url,
                  dayOfWeek: schedule.day_of_week,
                  originalStartTime: schedule.start_time,
                  originalEndTime: schedule.end_time,
                  hasOverride,
                  overrideNotes: override?.notes,
                },
              });
            }
            currentDate = addDays(currentDate, 1);
          }
        }

        // Fetch one-off schedules (single day schedules)
        let oneOffQuery = supabase
          .from('schedule_one_offs')
          .select(`
            *,
            user:users!schedule_one_offs_user_id_fkey(id, full_name, avatar_url)
          `)
          .gte('schedule_date', filters.startDate)
          .lte('schedule_date', filters.endDate);

        if (filters.userId) {
          oneOffQuery = oneOffQuery.eq('user_id', filters.userId);
        }

        const { data: oneOffSchedules, error: oneOffError } = await oneOffQuery;

        if (oneOffError) {
          console.error('Error fetching one-off schedules:', oneOffError);
        } else {
          for (const schedule of oneOffSchedules || []) {
            const user = schedule.user as { id: string; full_name: string; avatar_url: string | null } | null;
            if (!user) continue;

            const dateStr = schedule.schedule_date;

            // Skip if employee has approved leave for this day
            if (leaveDaysSet.has(`${schedule.user_id}-${dateStr}`)) {
              continue;
            }

            events.push({
              id: `one-off-schedule-${schedule.id}`,
              type: 'schedule',
              title: `${user.full_name}`,
              start: `${dateStr}T${schedule.start_time}`,
              end: `${dateStr}T${schedule.end_time}`,
              allDay: false,
              color: '#94a3b8', // soft gray - same as regular schedules
              resourceId: schedule.id,
              extendedProps: {
                oneOffScheduleId: schedule.id,
                scheduleDate: dateStr,
                userId: schedule.user_id,
                userName: user.full_name,
                avatarUrl: user.avatar_url,
                isOneOff: true,
                startTime: schedule.start_time,
                endTime: schedule.end_time,
              },
            });
          }
        }
      }

      return events;
    },
  });
}
