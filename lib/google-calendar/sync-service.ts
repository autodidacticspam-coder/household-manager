import { createHash } from 'crypto';
import { getApiAdminClient } from '@/lib/supabase/api-helpers';
import { chunkForInFilter } from '@/lib/supabase/pagination';
import {
  getValidAccessToken,
  getUserCalendarId,
  getUserSyncFilters,
  normalizeSyncFilters,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listSyncedEvents,
  runWithConcurrency,
  type SyncFilters,
  type GoogleCalendarEvent,
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
    desiredCount: number;
    existingCount: number;
    created: number;
    updated: number;
    deleted: number;
    unchanged: number;
    failed: number;
    firstError?: string;
    tasksCount: number;
    leaveCount: number;
    schedulesCount: number;
    importantDatesCount: number;
    childLogsCount: number;
    dateRange: { start: string; end: string };
    filters?: SyncFilters;
  };
}

interface DesiredEvent {
  eventType: string;
  sourceId: string;
  event: GoogleCalendarEvent;
  contentHash: string;
}

/**
 * Hash the visible payload of an event so reconciliation can tell whether an
 * already-synced Google event still matches what we would create today.
 */
function computeContentHash(event: GoogleCalendarEvent): string {
  const payload = JSON.stringify({
    summary: event.summary,
    description: event.description || '',
    start: event.start,
    end: event.end,
    colorId: event.colorId || '',
  });
  return createHash('sha1').update(payload).digest('hex');
}

function withSyncProperties(event: GoogleCalendarEvent, contentHash: string): GoogleCalendarEvent {
  return {
    ...event,
    extendedProperties: {
      private: {
        ...(event.extendedProperties?.private || {}),
        contentHash,
      },
    },
  };
}

/**
 * Sync all events for a user based on their filters.
 *
 * This is a reconciliation, not a rebuild: we list the events our sync owns
 * in Google Calendar (identified by private extended properties), diff them
 * against what the database says should exist, and only create/update/delete
 * the differences. Repeat syncs with no changes make almost no API calls, so
 * the sync stays fast and cannot leave duplicates behind when interrupted.
 */
export async function syncAllEventsForUser(userId: string): Promise<SyncResult> {
  const supabase = getApiAdminClient();
  const debug: NonNullable<SyncResult['debug']> = {
    version: 'v8-reconcile',
    desiredCount: 0,
    existingCount: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    unchanged: 0,
    failed: 0,
    tasksCount: 0,
    leaveCount: 0,
    schedulesCount: 0,
    importantDatesCount: 0,
    childLogsCount: 0,
    dateRange: { start: '', end: '' },
  };

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

  try {
    // 1. Build the desired event set from the database
    const desired = new Map<string, DesiredEvent>();

    if (filters.tasks || filters.activities) {
      const taskEvents = await buildTaskEvents(startDate, endDate, filters.tasks, filters.activities);
      debug.tasksCount = addDesiredEvents(desired, 'task', taskEvents);
    }
    if (filters.leave) {
      debug.leaveCount = addDesiredEvents(desired, 'leave', await buildLeaveEvents(startDate, endDate));
    }
    if (filters.schedules) {
      debug.schedulesCount = addDesiredEvents(desired, 'schedule', await buildScheduleEvents(startDate, endDate));
    }
    if (filters.importantDates) {
      debug.importantDatesCount = addDesiredEvents(desired, 'important_date', await buildImportantDateEvents());
    }
    debug.childLogsCount = addDesiredEvents(
      desired,
      'child_log',
      await buildChildLogEvents(startDate, endDate, filters.childLogs)
    );
    debug.desiredCount = desired.size;

    // 2. List what our sync currently owns in Google Calendar
    // List only what this pass reconciles: events outside the desired window
    // must stay untouched (they were instant-synced and will enter the window
    // eventually). The +2d margin keeps overnight rollovers covered.
    const listMin = new Date(`${startDate}T00:00:00Z`);
    const listMax = addDays(new Date(`${endDate}T00:00:00Z`), 2);
    const existing = await listSyncedEvents(accessToken, calendarId, listMin, listMax);
    debug.existingCount = existing.length;

    // 3. Diff. Keep at most one Google event per desired key; everything
    //    else our sync owns (duplicates, stale filters, old junk) is deleted.
    const keptByKey = new Map<string, { googleEventId: string; contentHash?: string }>();
    const toDelete: string[] = [];

    for (const event of existing) {
      const key = `${event.sourceType}:${event.sourceId || ''}`;
      const wanted = desired.get(key);
      if (!wanted || keptByKey.has(key)) {
        toDelete.push(event.id);
        continue;
      }
      keptByKey.set(key, { googleEventId: event.id, contentHash: event.contentHash });
    }

    const toCreate: DesiredEvent[] = [];
    const toUpdate: Array<{ desired: DesiredEvent; googleEventId: string }> = [];
    for (const [key, want] of desired) {
      const kept = keptByKey.get(key);
      if (!kept) {
        toCreate.push(want);
      } else if (kept.contentHash !== want.contentHash) {
        toUpdate.push({ desired: want, googleEventId: kept.googleEventId });
      } else {
        debug.unchanged++;
      }
    }

    let firstError: string | undefined;

    // 4. Apply deletions
    const deleteResults = await runWithConcurrency(toDelete, 4, (eventId) =>
      deleteCalendarEvent(accessToken, calendarId, eventId)
    );
    for (const result of deleteResults) {
      if (result.success) debug.deleted++;
      else {
        debug.failed++;
        firstError = firstError || result.error;
      }
    }

    interface OpResult {
      ok: boolean;
      eventType?: string;
      sourceId?: string;
      googleEventId?: string;
      error?: string;
    }

    // 5. Apply updates (recreate if the event vanished from Google)
    const updateResults: OpResult[] = await runWithConcurrency(toUpdate, 4, async ({ desired: want, googleEventId }) => {
      const body = withSyncProperties(want.event, want.contentHash);
      const result = await updateCalendarEvent(accessToken, calendarId, googleEventId, body);
      if (result.notFound) {
        const created = await createCalendarEvent(accessToken, calendarId, body);
        return created.success && created.eventId
          ? { ok: true, eventType: want.eventType, sourceId: want.sourceId, googleEventId: created.eventId }
          : { ok: false, error: created.error };
      }
      return result.success
        ? { ok: true, eventType: want.eventType, sourceId: want.sourceId, googleEventId }
        : { ok: false, error: result.error };
    });

    // 6. Apply creations
    const createResults: OpResult[] = await runWithConcurrency(toCreate, 4, async (want) => {
      const body = withSyncProperties(want.event, want.contentHash);
      const result = await createCalendarEvent(accessToken, calendarId, body);
      return result.success && result.eventId
        ? { ok: true, eventType: want.eventType, sourceId: want.sourceId, googleEventId: result.eventId }
        : { ok: false, error: result.error };
    });

    for (const result of updateResults) {
      if (result.ok) debug.updated++;
      else {
        debug.failed++;
        firstError = firstError || result.error;
      }
    }
    for (const result of createResults) {
      if (result.ok) debug.created++;
      else {
        debug.failed++;
        firstError = firstError || result.error;
      }
    }

    // 7. Rebuild the tracking table to mirror the final state in Google.
    //    Kept events first, then successful updates/creates overwrite by key.
    type SyncedRow = { user_id: string; event_type: string; source_id: string; google_event_id: string };
    const rowsByKey = new Map<string, SyncedRow>();
    for (const [key, kept] of keptByKey) {
      const want = desired.get(key)!;
      rowsByKey.set(key, {
        user_id: userId,
        event_type: want.eventType,
        source_id: want.sourceId,
        google_event_id: kept.googleEventId,
      });
    }
    for (const result of [...updateResults, ...createResults]) {
      if (result.ok && result.eventType && result.sourceId && result.googleEventId) {
        rowsByKey.set(`${result.eventType}:${result.sourceId}`, {
          user_id: userId,
          event_type: result.eventType,
          source_id: result.sourceId,
          google_event_id: result.googleEventId,
        });
      }
    }

    // Remove mappings only for events this pass actually deleted, and upsert
    // the rest. A blanket delete-all + insert raced with concurrent instant
    // syncs (running via after()) and wiped mappings for events outside this
    // pass's window, causing duplicate Google events on their next update.
    for (let i = 0; i < toDelete.length; i += 200) {
      const { error: deleteError } = await supabase
        .from('google_calendar_synced_events')
        .delete()
        .eq('user_id', userId)
        .in('google_event_id', toDelete.slice(i, i + 200));
      if (deleteError) {
        console.error('Error pruning synced events:', deleteError);
      }
    }

    const allRows = Array.from(rowsByKey.values());
    for (let i = 0; i < allRows.length; i += 500) {
      const { error: upsertError } = await supabase
        .from('google_calendar_synced_events')
        .upsert(allRows.slice(i, i + 500), { onConflict: 'user_id,event_type,source_id' });
      if (upsertError) {
        console.error('Error saving synced events:', upsertError);
      }
    }

    debug.firstError = firstError;

    // 8. Record completion. Individual event failures don't invalidate the
    //    pass; the next reconciliation will retry just the missing pieces.
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

function addDesiredEvents(
  desired: Map<string, DesiredEvent>,
  eventType: string,
  events: Array<{ sourceId: string; event: GoogleCalendarEvent }>
): number {
  for (const { sourceId, event } of events) {
    desired.set(`${eventType}:${sourceId}`, {
      eventType,
      sourceId,
      event,
      contentHash: computeContentHash(event),
    });
  }
  return events.length;
}

async function buildTaskEvents(
  startDate: string,
  endDate: string,
  includeTasks: boolean,
  includeActivities: boolean
): Promise<Array<{ sourceId: string; event: GoogleCalendarEvent }>> {
  const supabase = getApiAdminClient();

  // "Tasks" and "Activities" (timed events like lessons) are separate sync
  // filters but share the tasks table, split by the is_activity flag.
  let query = supabase
    .from('tasks')
    .select('id, title, description, due_date, due_time, is_all_day, is_activity, start_time, end_time, status, priority')
    .gte('due_date', startDate)
    .lte('due_date', endDate)
    .order('due_date');

  if (includeTasks && !includeActivities) {
    query = query.eq('is_activity', false);
  } else if (includeActivities && !includeTasks) {
    query = query.eq('is_activity', true);
  }

  const { data: tasks } = await query;

  return (tasks || []).map((task) => ({
    sourceId: task.id,
    event: taskToCalendarEvent({
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
    }),
  }));
}

async function buildLeaveEvents(
  startDate: string,
  endDate: string
): Promise<Array<{ sourceId: string; event: GoogleCalendarEvent }>> {
  const supabase = getApiAdminClient();

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
    .lte('start_date', endDate)
    .gte('end_date', startDate);

  return (leaveRequests || []).map((leave) => {
    const user = leave.user as unknown as { full_name: string } | null;
    return {
      sourceId: leave.id,
      event: leaveToCalendarEvent({
        id: leave.id,
        employeeName: user?.full_name || 'Employee',
        startDate: leave.start_date,
        endDate: leave.end_date,
        leaveType: leave.leave_type,
        status: leave.status,
      }),
    };
  });
}

async function buildScheduleEvents(
  startDate: string,
  endDate: string
): Promise<Array<{ sourceId: string; event: GoogleCalendarEvent }>> {
  const supabase = getApiAdminClient();
  const events: Array<{ sourceId: string; event: GoogleCalendarEvent }> = [];

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

  const { data: overrides } = await supabase
    .from('schedule_overrides')
    .select('schedule_id, override_date, start_time, end_time, is_cancelled')
    .gte('override_date', startDate)
    .lte('override_date', endDate);

  const overrideMap = new Map<string, { start_time: string | null; end_time: string | null; is_cancelled: boolean }>();
  for (const override of overrides || []) {
    overrideMap.set(`${override.schedule_id}-${override.override_date}`, {
      start_time: override.start_time,
      end_time: override.end_time,
      is_cancelled: override.is_cancelled,
    });
  }

  const leaveDaysSet = await getLeaveDaysSet(startDate, endDate);

  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    const dateStr = format(d, 'yyyy-MM-dd');

    for (const schedule of schedules || []) {
      if (schedule.day_of_week !== dayOfWeek) continue;
      if (leaveDaysSet.has(`${schedule.user_id}-${dateStr}`)) continue;

      const localId = `${schedule.id}-${dateStr}`;
      const override = overrideMap.get(localId);
      if (override?.is_cancelled) continue;

      const user = schedule.user as unknown as { full_name: string } | null;
      events.push({
        sourceId: localId,
        event: scheduleToCalendarEvent({
          id: localId,
          employeeName: user?.full_name || 'Employee',
          date: dateStr,
          startTime: override?.start_time || schedule.start_time,
          endTime: override?.end_time || schedule.end_time,
        }),
      });
    }
  }

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
    if (leaveDaysSet.has(`${schedule.user_id}-${schedule.schedule_date}`)) continue;

    const user = schedule.user as unknown as { full_name: string } | null;
    const localId = `one-off-${schedule.id}`;
    events.push({
      sourceId: localId,
      event: scheduleToCalendarEvent({
        id: localId,
        employeeName: user?.full_name || 'Employee',
        date: schedule.schedule_date,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
      }),
    });
  }

  return events;
}

async function getLeaveDaysSet(startDate: string, endDate: string): Promise<Set<string>> {
  const supabase = getApiAdminClient();

  const { data: approvedLeaves } = await supabase
    .from('leave_requests')
    .select('user_id, start_date, end_date, selected_dates')
    .eq('status', 'approved')
    .lte('start_date', endDate)
    .gte('end_date', startDate);

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
  return leaveDaysSet;
}

async function buildImportantDateEvents(): Promise<Array<{ sourceId: string; event: GoogleCalendarEvent }>> {
  const supabase = getApiAdminClient();

  const { data: employees } = await supabase
    .from('users')
    .select('id, full_name, important_dates')
    .not('important_dates', 'is', null);

  const events: Array<{ sourceId: string; event: GoogleCalendarEvent }> = [];
  const currentYear = new Date().getFullYear();

  for (const employee of employees || []) {
    const dates = employee.important_dates as Array<{ label: string; date: string }> | null;
    if (!dates) continue;

    for (const importantDate of dates) {
      const sourceId = `${employee.id}-${importantDate.label}`;
      events.push({
        sourceId,
        event: importantDateToCalendarEvent({
          id: sourceId,
          employeeName: employee.full_name,
          label: importantDate.label,
          date: importantDate.date,
          year: currentYear,
        }),
      });
    }
  }
  return events;
}

async function buildChildLogEvents(
  startDate: string,
  endDate: string,
  logFilters: SyncFilters['childLogs']
): Promise<Array<{ sourceId: string; event: GoogleCalendarEvent }>> {
  const supabase = getApiAdminClient();

  const categories: string[] = [];
  if (logFilters.sleep) categories.push('sleep');
  if (logFilters.food) categories.push('food');
  if (logFilters.poop) categories.push('poop');
  if (logFilters.shower) categories.push('shower');

  if (categories.length === 0) return [];

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

  return (logs || []).map((log) => {
    const child = log.child as unknown as { name: string } | null;
    return {
      sourceId: log.id,
      event: childLogToCalendarEvent({
        id: log.id,
        childName: child?.name || 'Child',
        category: log.category as 'sleep' | 'food' | 'poop' | 'shower',
        logDate: log.log_date,
        logTime: log.log_time,
        description: log.description,
        endTime: log.end_time,
      }),
    };
  });
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
 * Create or update a single event for one connected user, recreating it if
 * the tracked Google event no longer exists.
 */
async function upsertEventForUser(
  userId: string,
  accessToken: string,
  calendarId: string,
  eventType: string,
  sourceId: string,
  event: GoogleCalendarEvent
): Promise<void> {
  const supabase = getApiAdminClient();
  const body = withSyncProperties(event, computeContentHash(event));

  const { data: syncedEvent } = await supabase
    .from('google_calendar_synced_events')
    .select('google_event_id')
    .eq('user_id', userId)
    .eq('event_type', eventType)
    .eq('source_id', sourceId)
    .single();

  if (syncedEvent) {
    const result = await updateCalendarEvent(accessToken, calendarId, syncedEvent.google_event_id, body);
    if (result.success) return;
    if (!result.notFound) return; // transient failure; next full sync repairs
  }

  // No tracked event (or it was deleted in Google): create it
  const created = await createCalendarEvent(accessToken, calendarId, body);
  if (created.success && created.eventId) {
    await saveSyncedEvent(userId, eventType, sourceId, created.eventId);
  }
}

async function deleteEventForUser(
  userId: string,
  accessToken: string,
  calendarId: string,
  eventType: string,
  sourceId: string
): Promise<void> {
  const supabase = getApiAdminClient();

  const { data: syncedEvent } = await supabase
    .from('google_calendar_synced_events')
    .select('google_event_id')
    .eq('user_id', userId)
    .eq('event_type', eventType)
    .eq('source_id', sourceId)
    .single();

  if (syncedEvent) {
    await deleteCalendarEvent(accessToken, calendarId, syncedEvent.google_event_id);
    await supabase
      .from('google_calendar_synced_events')
      .delete()
      .eq('user_id', userId)
      .eq('event_type', eventType)
      .eq('source_id', sourceId);
  }
}

/**
 * Of the given source ids, return only those with at least one synced Google
 * event. Bulk delete paths use this to skip dispatching per-row syncs that
 * would be no-ops: dispatching one sync per deleted row (each of which
 * re-reads tokens and mappings) stalls the post-response hook for minutes
 * when a batch has hundreds of rows.
 */
export async function filterSyncedSourceIds(
  eventType: 'task' | 'leave' | 'schedule' | 'important_date' | 'child_log',
  sourceIds: string[]
): Promise<string[]> {
  const supabase = getApiAdminClient();
  const synced = new Set<string>();

  // Chunk of 100: each source id can have one mapping row per connected
  // user, and the response must stay under PostgREST's 1000-row cap.
  for (const part of chunkForInFilter(sourceIds, 100)) {
    const { data, error } = await supabase
      .from('google_calendar_synced_events')
      .select('source_id')
      .eq('event_type', eventType)
      .in('source_id', part);

    if (error) {
      console.error('Synced-event lookup failed:', error);
      // Fail open: sync every id in this chunk rather than stranding events
      for (const id of part) synced.add(id);
      continue;
    }
    for (const row of data || []) synced.add(row.source_id);
  }

  return sourceIds.filter((id) => synced.has(id));
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

  // Map event type to filter path. Note the filter keys are plural
  // ('schedules'), not the singular event type; tasks and child logs get
  // special handling below.
  const filterPath = eventType === 'important_date'
    ? 'importantDates'
    : eventType === 'schedule'
    ? 'schedules'
    : eventType === 'leave'
    ? 'leave'
    : null;

  // Get all connected users with their filters
  const { data: tokens } = await supabase
    .from('google_calendar_tokens')
    .select('user_id, calendar_id, sync_filters');

  if (!tokens) return;

  for (const token of tokens) {
    const filters = normalizeSyncFilters(token.sync_filters);

    // Check if user has this filter enabled
    let shouldSync = false;
    if (eventType === 'task') {
      // Timed activities (lessons, sports) and plain to-dos are separate
      // filters. Deletes carry no event data, so allow them when either
      // filter is on — deleting an event that was never synced is a no-op.
      const isActivity = (eventData as { isActivity?: boolean } | undefined)?.isActivity === true;
      shouldSync = action === 'delete'
        ? filters.tasks || filters.activities
        : isActivity
        ? filters.activities
        : filters.tasks;
    } else if (filterPath) {
      shouldSync = filters[filterPath as keyof Omit<SyncFilters, 'childLogs'>] === true;
    } else if (eventType === 'child_log') {
      if (action === 'delete') {
        // Deletes carry no event data; allow when any child-log filter is on
        // (deleting an event that was never synced is a no-op).
        shouldSync = Object.values(filters.childLogs || {}).some(Boolean);
      } else if (eventData) {
        // Check specific child log category
        const category = (eventData as { category?: string }).category;
        if (category && filters.childLogs?.[category as keyof SyncFilters['childLogs']]) {
          shouldSync = true;
        }
      }
    }

    if (!shouldSync) continue;

    const accessToken = await getValidAccessToken(token.user_id);
    if (!accessToken) continue;

    if (action === 'delete') {
      await deleteEventForUser(token.user_id, accessToken, token.calendar_id, eventType, sourceId);
    } else if (eventData) {
      // create and update share the same upsert path, so an "update" for an
      // event that was never synced (e.g. after a failed full sync) still
      // lands in the calendar instead of being silently dropped.
      const event = mapEventData(eventType, eventData);
      if (event) {
        await upsertEventForUser(token.user_id, accessToken, token.calendar_id, eventType, sourceId, event);
      }
    }
  }
}

function mapEventData(eventType: string, data: unknown): GoogleCalendarEvent | null {
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
    const filters = normalizeSyncFilters(token.sync_filters);
    if (!filters.schedules) continue;

    const accessToken = await getValidAccessToken(token.user_id);
    if (!accessToken) continue;

    // Remove all occurrences of this schedule that we previously synced
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

    if (action === 'delete' || !scheduleData) {
      continue;
    }

    const { data: user } = await supabase
      .from('users')
      .select('full_name')
      .eq('id', scheduleData.userId)
      .single();

    const employeeName = user?.full_name || 'Employee';

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
      .lte('start_date', endDate)
      .gte('end_date', startDate);

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

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay();
      const dateStr = format(d, 'yyyy-MM-dd');

      if (dayOfWeek !== scheduleData.dayOfWeek) continue;
      if (leaveDaysSet.has(dateStr)) continue;

      const override = overrideMap.get(dateStr);
      if (override?.is_cancelled) continue;

      const localId = `${scheduleId}-${dateStr}`;
      const event = scheduleToCalendarEvent({
        id: localId,
        employeeName,
        date: dateStr,
        startTime: override?.start_time || scheduleData.startTime,
        endTime: override?.end_time || scheduleData.endTime,
      });

      await upsertEventForUser(token.user_id, accessToken, token.calendar_id, 'schedule', localId, event);
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
    const filters = normalizeSyncFilters(token.sync_filters);
    if (!filters.schedules) continue;

    const accessToken = await getValidAccessToken(token.user_id);
    if (!accessToken) continue;

    if (overrideData?.isCancelled && action !== 'delete') {
      await deleteEventForUser(token.user_id, accessToken, token.calendar_id, 'schedule', localId);
      continue;
    }

    const event = scheduleToCalendarEvent({
      id: localId,
      employeeName,
      date: overrideDate,
      startTime: overrideData?.startTime || schedule.start_time,
      endTime: overrideData?.endTime || schedule.end_time,
    });

    await upsertEventForUser(token.user_id, accessToken, token.calendar_id, 'schedule', localId, event);
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
    const filters = normalizeSyncFilters(token.sync_filters);
    if (!filters.schedules) continue;

    const accessToken = await getValidAccessToken(token.user_id);
    if (!accessToken) continue;

    if (action === 'delete') {
      await deleteEventForUser(token.user_id, accessToken, token.calendar_id, 'schedule', localId);
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

    await upsertEventForUser(token.user_id, accessToken, token.calendar_id, 'schedule', localId, event);
  }
}
