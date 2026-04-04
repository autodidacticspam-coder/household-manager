import { getApiAdminClient } from '@/lib/supabase/api-helpers';
import {
  getValidAccessToken,
  getUserCalendarId,
  getUserSyncFilters,
  DEFAULT_SYNC_FILTERS,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  deleteAllSyncedEvents,
  type SyncFilters,
} from './calendar-service';
import {
  taskToCalendarEvent,
  leaveToCalendarEvent,
  scheduleToCalendarEvent,
  importantDateToCalendarEvent,
  childLogToCalendarEvent,
} from './event-mapper';
import { format, subDays, addDays } from 'date-fns';

interface SyncResult {
  success: boolean;
  error?: string;
  debug?: {
    version: string;
    deletedFromGoogle?: number;
    deleteErrors?: number;
    tasksCount: number;
    tasksFound?: number;
    firstTaskError?: string;
    leaveCount: number;
    schedulesCount: number;
    importantDatesCount: number;
    childLogsCount: number;
    dateRange: { start: string; end: string };
    filters?: SyncFilters;
    totalTasksInDb?: number | null;
    sampleTasks?: Array<{ id: string; title: string; due_date: string }>;
  };
}

/**
 * Sync all events for a user based on their filters
 */
export async function syncAllEventsForUser(userId: string): Promise<SyncResult> {
  const supabase = getApiAdminClient();
  const debug: NonNullable<SyncResult['debug']> = {
    version: 'v4',
    tasksCount: 0,
    leaveCount: 0,
    schedulesCount: 0,
    importantDatesCount: 0,
    childLogsCount: 0,
    dateRange: { start: '', end: '' },
  };

  // Get access token and filters
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return { success: false, error: 'No valid access token', debug };
  }

  const calendarId = await getUserCalendarId(userId);
  if (!calendarId) {
    return { success: false, error: 'No calendar ID found', debug };
  }

  const filters = await getUserSyncFilters(userId);
  debug.filters = filters || undefined;
  if (!filters) {
    return { success: false, error: 'No filters found', debug };
  }

  // Date range: 30 days back, 90 days forward
  const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const endDate = format(addDays(new Date(), 90), 'yyyy-MM-dd');
  debug.dateRange = { start: startDate, end: endDate };

  // Always query total tasks count for debugging (regardless of filters)
  const { count: totalCount, error: countError } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true });

  debug.totalTasksInDb = totalCount;
  if (countError) {
    console.error('Error counting tasks:', countError);
  }

  // Get sample tasks for debugging
  const { data: sampleData } = await supabase
    .from('tasks')
    .select('id, title, due_date')
    .limit(3);
  debug.sampleTasks = (sampleData || []).map(t => ({ id: t.id, title: t.title, due_date: t.due_date }));

  try {
    // Remove any previously-synced Google events before rebuilding the feed.
    // Without this, a second full sync recreates the same logical events and
    // leaves duplicate copies behind in the user's calendar.
    const deleteResult = await deleteAllSyncedEvents(accessToken, calendarId);
    debug.deletedFromGoogle = deleteResult.deleted;
    debug.deleteErrors = deleteResult.errors;

    if (deleteResult.errors > 0) {
      return {
        success: false,
        error: `Failed to remove ${deleteResult.errors} existing synced calendar events before rebuilding sync`,
        debug,
      };
    }

    // Clear existing synced events for this user (fresh sync)
    await supabase
      .from('google_calendar_synced_events')
      .delete()
      .eq('user_id', userId);

    // Sync tasks
    if (filters.tasks) {
      const taskResult = await syncTasks(userId, accessToken, calendarId, startDate, endDate);
      debug.tasksCount = taskResult.count;
      debug.tasksFound = taskResult.tasksFound;
      debug.firstTaskError = taskResult.firstError;
      debug.totalTasksInDb = taskResult.totalInDb;
      debug.sampleTasks = taskResult.sampleTasks;
    }

    // Sync leave
    if (filters.leave) {
      debug.leaveCount = await syncLeave(userId, accessToken, calendarId, startDate, endDate);
    }

    // Sync schedules
    if (filters.schedules) {
      debug.schedulesCount = await syncSchedules(userId, accessToken, calendarId, startDate, endDate);
    }

    // Sync important dates
    if (filters.importantDates) {
      debug.importantDatesCount = await syncImportantDates(userId, accessToken, calendarId);
    }

    // Sync child logs
    debug.childLogsCount = await syncChildLogs(userId, accessToken, calendarId, startDate, endDate, filters.childLogs);

    // Update last_synced timestamp
    await supabase
      .from('google_calendar_tokens')
      .update({ last_synced: new Date().toISOString() })
      .eq('user_id', userId);

    return { success: true, debug };
  } catch (error) {
    console.error('Error syncing events:', error);
    return { success: false, error: String(error), debug };
  }
}

interface TaskSyncResult {
  count: number;
  totalInDb: number | null;
  tasksFound: number;
  firstError?: string;
  sampleTasks: Array<{ id: string; title: string; due_date: string }>;
}

async function syncTasks(
  userId: string,
  accessToken: string,
  calendarId: string,
  startDate: string,
  endDate: string
): Promise<TaskSyncResult> {
  const supabase = getApiAdminClient();
  const result: TaskSyncResult = { count: 0, totalInDb: null, tasksFound: 0, sampleTasks: [] };

  // First, test query to count all tasks
  const { count: totalCount } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true });

  result.totalInDb = totalCount;

  // Get tasks in date range
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, description, due_date, due_time, is_all_day, is_activity, start_time, end_time, status, priority')
    .gte('due_date', startDate)
    .lte('due_date', endDate)
    .order('due_date');

  // Get sample tasks for debugging
  if (!tasks || tasks.length === 0) {
    const { data: allTasks } = await supabase
      .from('tasks')
      .select('id, title, due_date')
      .limit(5);
    result.sampleTasks = (allTasks || []).map(t => ({ id: t.id, title: t.title, due_date: t.due_date }));
  }

  if (!tasks) return result;

  result.tasksFound = tasks.length;

  for (const task of tasks) {
    const event = taskToCalendarEvent({
      id: task.id,
      title: task.title,
      description: task.description,
      dueDate: task.due_date,
      dueTime: task.due_time,
      isAllDay: task.is_all_day,
      isActivity: task.is_activity,
      startTime: task.start_time,
      endTime: task.end_time,
      status: task.status,
      priority: task.priority,
    });

    const createResult = await createCalendarEvent(accessToken, calendarId, event);
    if (createResult.success && createResult.eventId) {
      await saveSyncedEvent(userId, 'task', task.id, createResult.eventId);
      result.count++;
    } else if (!result.firstError && createResult.error) {
      // Capture first error for debugging
      result.firstError = createResult.error;
    }
  }
  return result;
}

async function syncLeave(
  userId: string,
  accessToken: string,
  calendarId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const supabase = getApiAdminClient();

  // Get approved leave requests in date range
  const { data: leaveRequests } = await supabase
    .from('leave_requests')
    .select(`
      id,
      start_date,
      end_date,
      leave_type,
      status,
      user:users!leave_requests_user_id_fkey(full_name)
    `)
    .eq('status', 'approved')
    .or(`start_date.lte.${endDate},end_date.gte.${startDate}`);

  if (!leaveRequests) return 0;

  let syncedCount = 0;
  for (const leave of leaveRequests) {
    const user = leave.user as unknown as { full_name: string } | null;
    const event = leaveToCalendarEvent({
      id: leave.id,
      employeeName: user?.full_name || 'Employee',
      startDate: leave.start_date,
      endDate: leave.end_date,
      leaveType: leave.leave_type,
      status: leave.status,
    });

    const result = await createCalendarEvent(accessToken, calendarId, event);
    if (result.success && result.eventId) {
      await saveSyncedEvent(userId, 'leave', leave.id, result.eventId);
      syncedCount++;
    }
  }
  return syncedCount;
}

async function syncSchedules(
  userId: string,
  accessToken: string,
  calendarId: string,
  startDate: string,
  endDate: string
): Promise<number> {
  const supabase = getApiAdminClient();

  // Get employee schedules and generate events for each day in range
  const { data: schedules } = await supabase
    .from('employee_schedules')
    .select(`
      id,
      user_id,
      day_of_week,
      start_time,
      end_time,
      user:users!employee_schedules_user_id_fkey(full_name)
    `)
    .eq('is_active', true);

  if (!schedules || schedules.length === 0) return 0;

  // Get schedule overrides for the date range
  const { data: overrides } = await supabase
    .from('schedule_overrides')
    .select('schedule_id, override_date, start_time, end_time, is_cancelled')
    .gte('override_date', startDate)
    .lte('override_date', endDate);

  const overrideMap = new Map<string, { start_time: string | null; end_time: string | null; is_cancelled: boolean }>();
  for (const override of overrides || []) {
    const key = `${override.schedule_id}-${override.override_date}`;
    overrideMap.set(key, {
      start_time: override.start_time,
      end_time: override.end_time,
      is_cancelled: override.is_cancelled,
    });
  }

  // Get approved leave requests to exclude schedule on days off
  const { data: approvedLeaves } = await supabase
    .from('leave_requests')
    .select('user_id, start_date, end_date, selected_dates')
    .eq('status', 'approved')
    .or(`start_date.lte.${endDate},end_date.gte.${startDate}`);

  const leaveDaysSet = new Set<string>();
  for (const leave of approvedLeaves || []) {
    if (leave.selected_dates && Array.isArray(leave.selected_dates)) {
      for (const dateStr of leave.selected_dates) {
        leaveDaysSet.add(`${leave.user_id}-${dateStr}`);
      }
    } else {
      let leaveDate = new Date(leave.start_date + 'T00:00:00');
      const leaveEnd = new Date(leave.end_date + 'T00:00:00');
      while (leaveDate <= leaveEnd) {
        leaveDaysSet.add(`${leave.user_id}-${format(leaveDate, 'yyyy-MM-dd')}`);
        leaveDate = addDays(leaveDate, 1);
      }
    }
  }

  let syncedCount = 0;
  const start = new Date(startDate);
  const end = new Date(endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    const dateStr = format(d, 'yyyy-MM-dd');

    for (const schedule of schedules) {
      if (schedule.day_of_week === dayOfWeek) {
        if (leaveDaysSet.has(`${schedule.user_id}-${dateStr}`)) {
          continue;
        }

        const user = schedule.user as unknown as { full_name: string } | null;
        const localId = `${schedule.id}-${dateStr}`;
        const override = overrideMap.get(localId);

        if (override?.is_cancelled) {
          continue;
        }

        const event = scheduleToCalendarEvent({
          id: localId,
          employeeName: user?.full_name || 'Employee',
          date: dateStr,
          startTime: override?.start_time || schedule.start_time,
          endTime: override?.end_time || schedule.end_time,
        });

        const result = await createCalendarEvent(accessToken, calendarId, event);
        if (result.success && result.eventId) {
          await saveSyncedEvent(userId, 'schedule', localId, result.eventId);
          syncedCount++;
        }
      }
    }
  }

  // Also sync one-off schedules
  const { data: oneOffSchedules } = await supabase
    .from('schedule_one_offs')
    .select(`
      id,
      user_id,
      schedule_date,
      start_time,
      end_time,
      user:users!schedule_one_offs_user_id_fkey(full_name)
    `)
    .gte('schedule_date', startDate)
    .lte('schedule_date', endDate);

  for (const schedule of oneOffSchedules || []) {
    if (leaveDaysSet.has(`${schedule.user_id}-${schedule.schedule_date}`)) {
      continue;
    }

    const user = schedule.user as unknown as { full_name: string } | null;
    const localId = `one-off-${schedule.id}`;
    const event = scheduleToCalendarEvent({
      id: localId,
      employeeName: user?.full_name || 'Employee',
      date: schedule.schedule_date,
      startTime: schedule.start_time,
      endTime: schedule.end_time,
    });

    const result = await createCalendarEvent(accessToken, calendarId, event);
    if (result.success && result.eventId) {
      await saveSyncedEvent(userId, 'schedule', localId, result.eventId);
      syncedCount++;
    }
  }

  return syncedCount;
}

async function syncImportantDates(
  userId: string,
  accessToken: string,
  calendarId: string
): Promise<number> {
  const supabase = getApiAdminClient();

  // Get employees with important dates
  const { data: employees } = await supabase
    .from('users')
    .select('id, full_name, important_dates')
    .not('important_dates', 'is', null);

  if (!employees) return 0;

  let syncedCount = 0;
  const currentYear = new Date().getFullYear();

  for (const employee of employees) {
    const dates = employee.important_dates as Array<{ label: string; date: string }> | null;
    if (!dates) continue;

    for (const importantDate of dates) {
      const event = importantDateToCalendarEvent({
        id: `${employee.id}-${importantDate.label}`,
        employeeName: employee.full_name,
        label: importantDate.label,
        date: importantDate.date,
        year: currentYear,
      });

      const result = await createCalendarEvent(accessToken, calendarId, event);
      if (result.success && result.eventId) {
        await saveSyncedEvent(userId, 'important_date', `${employee.id}-${importantDate.label}`, result.eventId);
        syncedCount++;
      }
    }
  }
  return syncedCount;
}

async function syncChildLogs(
  userId: string,
  accessToken: string,
  calendarId: string,
  startDate: string,
  endDate: string,
  logFilters: SyncFilters['childLogs']
): Promise<number> {
  const supabase = getApiAdminClient();

  // Build category filter
  const categories: string[] = [];
  if (logFilters.sleep) categories.push('sleep');
  if (logFilters.food) categories.push('food');
  if (logFilters.poop) categories.push('poop');
  if (logFilters.shower) categories.push('shower');

  if (categories.length === 0) return 0;

  // Get child logs in date range
  const { data: logs } = await supabase
    .from('child_logs')
    .select(`
      id,
      log_date,
      log_time,
      category,
      description,
      end_time,
      child:children!child_logs_child_id_fkey(name)
    `)
    .in('category', categories)
    .gte('log_date', startDate)
    .lte('log_date', endDate);

  if (!logs) return 0;

  let syncedCount = 0;
  for (const log of logs) {
    const child = log.child as unknown as { name: string } | null;
    const event = childLogToCalendarEvent({
      id: log.id,
      childName: child?.name || 'Child',
      category: log.category as 'sleep' | 'food' | 'poop' | 'shower',
      logDate: log.log_date,
      logTime: log.log_time,
      description: log.description,
      endTime: log.end_time,
    });

    const result = await createCalendarEvent(accessToken, calendarId, event);
    if (result.success && result.eventId) {
      await saveSyncedEvent(userId, 'child_log', log.id, result.eventId);
      syncedCount++;
    }
  }
  return syncedCount;
}

async function saveSyncedEvent(
  userId: string,
  eventType: string,
  sourceId: string,
  googleEventId: string
) {
  const supabase = getApiAdminClient();

  await supabase
    .from('google_calendar_synced_events')
    .upsert({
      user_id: userId,
      event_type: eventType,
      source_id: sourceId,
      google_event_id: googleEventId,
    }, {
      onConflict: 'user_id,event_type,source_id',
    });
}

/**
 * Sync a single event for all connected users who have the filter enabled
 */
export async function syncEventToConnectedUsers(
  eventType: 'task' | 'leave' | 'schedule' | 'important_date' | 'child_log',
  sourceId: string,
  action: 'create' | 'update' | 'delete',
  eventData?: unknown
): Promise<void> {
  const supabase = getApiAdminClient();

  // Map event type to filter path
  const filterPath = eventType === 'child_log'
    ? null // Child logs need category-specific handling
    : eventType === 'important_date'
    ? 'importantDates'
    : eventType;

  // Get all connected users with their filters
  const { data: tokens } = await supabase
    .from('google_calendar_tokens')
    .select('user_id, calendar_id, sync_filters');

  if (!tokens) return;

  for (const token of tokens) {
    const filters = (token.sync_filters as SyncFilters | null) || DEFAULT_SYNC_FILTERS;

    // Check if user has this filter enabled
    let shouldSync = false;
    if (filterPath) {
      shouldSync = filters[filterPath as keyof Omit<SyncFilters, 'childLogs'>] === true;
    } else if (eventType === 'child_log' && eventData) {
      // Check specific child log category
      const category = (eventData as { category?: string }).category;
      if (category && filters.childLogs?.[category as keyof SyncFilters['childLogs']]) {
        shouldSync = true;
      }
    }

    if (!shouldSync) continue;

    const accessToken = await getValidAccessToken(token.user_id);
    if (!accessToken) continue;

    if (action === 'delete') {
      // Find and delete the synced event
      const { data: syncedEvent } = await supabase
        .from('google_calendar_synced_events')
        .select('google_event_id')
        .eq('user_id', token.user_id)
        .eq('event_type', eventType)
        .eq('source_id', sourceId)
        .single();

      if (syncedEvent) {
        await deleteCalendarEvent(accessToken, token.calendar_id, syncedEvent.google_event_id);
        await supabase
          .from('google_calendar_synced_events')
          .delete()
          .eq('user_id', token.user_id)
          .eq('event_type', eventType)
          .eq('source_id', sourceId);
      }
    } else if (action === 'update') {
      // Find and update the synced event
      const { data: syncedEvent } = await supabase
        .from('google_calendar_synced_events')
        .select('google_event_id')
        .eq('user_id', token.user_id)
        .eq('event_type', eventType)
        .eq('source_id', sourceId)
        .single();

      if (syncedEvent && eventData) {
        const event = mapEventData(eventType, eventData);
        if (event) {
          await updateCalendarEvent(accessToken, token.calendar_id, syncedEvent.google_event_id, event);
        }
      }
    } else if (action === 'create' && eventData) {
      const event = mapEventData(eventType, eventData);
      if (event) {
        const result = await createCalendarEvent(accessToken, token.calendar_id, event);
        if (result.success && result.eventId) {
          await saveSyncedEvent(token.user_id, eventType, sourceId, result.eventId);
        }
      }
    }
  }
}

function mapEventData(eventType: string, data: unknown): ReturnType<typeof taskToCalendarEvent> | null {
  switch (eventType) {
    case 'task':
      return taskToCalendarEvent(data as Parameters<typeof taskToCalendarEvent>[0]);
    case 'leave':
      return leaveToCalendarEvent(data as Parameters<typeof leaveToCalendarEvent>[0]);
    case 'schedule':
      return scheduleToCalendarEvent(data as Parameters<typeof scheduleToCalendarEvent>[0]);
    case 'important_date':
      return importantDateToCalendarEvent(data as Parameters<typeof importantDateToCalendarEvent>[0]);
    case 'child_log':
      return childLogToCalendarEvent(data as Parameters<typeof childLogToCalendarEvent>[0]);
    default:
      return null;
  }
}

/**
 * Sync a base schedule change (employee_schedules table) to all connected users.
 */
export async function syncBaseScheduleChange(
  scheduleId: string,
  action: 'create' | 'update' | 'delete',
  scheduleData?: {
    userId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }
): Promise<void> {
  const supabase = getApiAdminClient();

  const { data: tokens } = await supabase
    .from('google_calendar_tokens')
    .select('user_id, calendar_id, sync_filters');

  if (!tokens) return;

  const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const endDate = format(addDays(new Date(), 90), 'yyyy-MM-dd');

  for (const token of tokens) {
    const filters = (token.sync_filters as SyncFilters | null) || DEFAULT_SYNC_FILTERS;
    if (!filters.schedules) continue;

    const accessToken = await getValidAccessToken(token.user_id);
    if (!accessToken) continue;

    if (action === 'delete') {
      const { data: syncedEvents } = await supabase
        .from('google_calendar_synced_events')
        .select('google_event_id, source_id')
        .eq('user_id', token.user_id)
        .eq('event_type', 'schedule')
        .like('source_id', `${scheduleId}-%`);

      for (const syncedEvent of syncedEvents || []) {
        await deleteCalendarEvent(accessToken, token.calendar_id, syncedEvent.google_event_id);
        await supabase
          .from('google_calendar_synced_events')
          .delete()
          .eq('user_id', token.user_id)
          .eq('event_type', 'schedule')
          .eq('source_id', syncedEvent.source_id);
      }

      continue;
    }

    if (!scheduleData) {
      continue;
    }

    const { data: user } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', scheduleData.userId)
      .single();

    const employeeName = user?.full_name || 'Employee';

    const { data: existingEvents } = await supabase
      .from('google_calendar_synced_events')
      .select('google_event_id, source_id')
      .eq('user_id', token.user_id)
      .eq('event_type', 'schedule')
      .like('source_id', `${scheduleId}-%`);

    for (const existing of existingEvents || []) {
      await deleteCalendarEvent(accessToken, token.calendar_id, existing.google_event_id);
      await supabase
        .from('google_calendar_synced_events')
        .delete()
        .eq('user_id', token.user_id)
        .eq('event_type', 'schedule')
        .eq('source_id', existing.source_id);
    }

    const { data: overrides } = await supabase
      .from('schedule_overrides')
      .select('override_date, start_time, end_time, is_cancelled')
      .eq('schedule_id', scheduleId)
      .gte('override_date', startDate)
      .lte('override_date', endDate);

    const overrideMap = new Map<string, { start_time: string | null; end_time: string | null; is_cancelled: boolean }>();
    for (const override of overrides || []) {
      overrideMap.set(override.override_date, {
        start_time: override.start_time,
        end_time: override.end_time,
        is_cancelled: override.is_cancelled,
      });
    }

    const { data: approvedLeaves } = await supabase
      .from('leave_requests')
      .select('start_date, end_date, selected_dates')
      .eq('user_id', scheduleData.userId)
      .eq('status', 'approved')
      .or(`start_date.lte.${endDate},end_date.gte.${startDate}`);

    const leaveDaysSet = new Set<string>();
    for (const leave of approvedLeaves || []) {
      if (leave.selected_dates && Array.isArray(leave.selected_dates)) {
        for (const dateStr of leave.selected_dates) {
          leaveDaysSet.add(dateStr);
        }
      } else {
        let leaveDate = new Date(leave.start_date + 'T00:00:00');
        const leaveEnd = new Date(leave.end_date + 'T00:00:00');
        while (leaveDate <= leaveEnd) {
          leaveDaysSet.add(format(leaveDate, 'yyyy-MM-dd'));
          leaveDate = addDays(leaveDate, 1);
        }
      }
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      const dateStr = format(d, 'yyyy-MM-dd');

      if (dayOfWeek !== scheduleData.dayOfWeek) continue;
      if (leaveDaysSet.has(dateStr)) continue;

      const override = overrideMap.get(dateStr);
      if (override?.is_cancelled) continue;

      const event = scheduleToCalendarEvent({
        id: `${scheduleId}-${dateStr}`,
        employeeName,
        date: dateStr,
        startTime: override?.start_time || scheduleData.startTime,
        endTime: override?.end_time || scheduleData.endTime,
      });

      const result = await createCalendarEvent(accessToken, token.calendar_id, event);
      if (result.success && result.eventId) {
        await saveSyncedEvent(token.user_id, 'schedule', `${scheduleId}-${dateStr}`, result.eventId);
      }
    }
  }
}

/**
 * Sync a schedule override change to all connected users.
 */
export async function syncScheduleOverrideChange(
  scheduleId: string,
  overrideDate: string,
  action: 'create' | 'update' | 'delete',
  overrideData?: {
    startTime: string | null;
    endTime: string | null;
    isCancelled: boolean;
  }
): Promise<void> {
  const supabase = getApiAdminClient();

  const { data: schedule } = await supabase
    .from('employee_schedules')
    .select(`
      id,
      user_id,
      start_time,
      end_time,
      user:users!employee_schedules_user_id_fkey(full_name)
    `)
    .eq('id', scheduleId)
    .single();

  if (!schedule) return;

  const user = schedule.user as unknown as { full_name: string } | null;
  const employeeName = user?.full_name || 'Employee';
  const localId = `${scheduleId}-${overrideDate}`;

  const { data: tokens } = await supabase
    .from('google_calendar_tokens')
    .select('user_id, calendar_id, sync_filters');

  if (!tokens) return;

  for (const token of tokens) {
    const filters = (token.sync_filters as SyncFilters | null) || DEFAULT_SYNC_FILTERS;
    if (!filters.schedules) continue;

    const accessToken = await getValidAccessToken(token.user_id);
    if (!accessToken) continue;

    const { data: syncedEvent } = await supabase
      .from('google_calendar_synced_events')
      .select('google_event_id')
      .eq('user_id', token.user_id)
      .eq('event_type', 'schedule')
      .eq('source_id', localId)
      .single();

    if (action === 'delete' || (overrideData && !overrideData.isCancelled)) {
      const event = scheduleToCalendarEvent({
        id: localId,
        employeeName,
        date: overrideDate,
        startTime: overrideData?.startTime || schedule.start_time,
        endTime: overrideData?.endTime || schedule.end_time,
      });

      if (syncedEvent) {
        await updateCalendarEvent(accessToken, token.calendar_id, syncedEvent.google_event_id, event);
      } else {
        const result = await createCalendarEvent(accessToken, token.calendar_id, event);
        if (result.success && result.eventId) {
          await saveSyncedEvent(token.user_id, 'schedule', localId, result.eventId);
        }
      }
    } else if (overrideData?.isCancelled && syncedEvent) {
      await deleteCalendarEvent(accessToken, token.calendar_id, syncedEvent.google_event_id);
      await supabase
        .from('google_calendar_synced_events')
        .delete()
        .eq('user_id', token.user_id)
        .eq('event_type', 'schedule')
        .eq('source_id', localId);
    }
  }
}

/**
 * Sync a one-off schedule change to all connected users.
 */
export async function syncOneOffScheduleChange(
  oneOffId: string,
  action: 'create' | 'update' | 'delete',
  scheduleData?: {
    userId: string;
    scheduleDate: string;
    startTime: string;
    endTime: string;
  }
): Promise<void> {
  const supabase = getApiAdminClient();
  const localId = `one-off-${oneOffId}`;

  const { data: tokens } = await supabase
    .from('google_calendar_tokens')
    .select('user_id, calendar_id, sync_filters');

  if (!tokens) return;

  for (const token of tokens) {
    const filters = (token.sync_filters as SyncFilters | null) || DEFAULT_SYNC_FILTERS;
    if (!filters.schedules) continue;

    const accessToken = await getValidAccessToken(token.user_id);
    if (!accessToken) continue;

    if (action === 'delete') {
      const { data: syncedEvent } = await supabase
        .from('google_calendar_synced_events')
        .select('google_event_id')
        .eq('user_id', token.user_id)
        .eq('event_type', 'schedule')
        .eq('source_id', localId)
        .single();

      if (syncedEvent) {
        await deleteCalendarEvent(accessToken, token.calendar_id, syncedEvent.google_event_id);
        await supabase
          .from('google_calendar_synced_events')
          .delete()
          .eq('user_id', token.user_id)
          .eq('event_type', 'schedule')
          .eq('source_id', localId);
      }

      continue;
    }

    if (!scheduleData) {
      continue;
    }

    const { data: user } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', scheduleData.userId)
      .single();

    const employeeName = user?.full_name || 'Employee';
    const event = scheduleToCalendarEvent({
      id: localId,
      employeeName,
      date: scheduleData.scheduleDate,
      startTime: scheduleData.startTime,
      endTime: scheduleData.endTime,
    });

    const { data: syncedEvent } = await supabase
      .from('google_calendar_synced_events')
      .select('google_event_id')
      .eq('user_id', token.user_id)
      .eq('event_type', 'schedule')
      .eq('source_id', localId)
      .single();

    if (action === 'update' && syncedEvent) {
      await updateCalendarEvent(accessToken, token.calendar_id, syncedEvent.google_event_id, event);
    } else {
      const result = await createCalendarEvent(accessToken, token.calendar_id, event);
      if (result.success && result.eventId) {
        await saveSyncedEvent(token.user_id, 'schedule', localId, result.eventId);
      }
    }
  }
}
