import { getApiAdminClient } from '@/lib/supabase/api-helpers';

// Google Calendar API URLs
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

// Sync filter types
export interface SyncFilters {
  tasks: boolean;
  activities: boolean;
  leave: boolean;
  schedules: boolean;
  importantDates: boolean;
  childLogs: {
    sleep: boolean;
    food: boolean;
    poop: boolean;
    shower: boolean;
  };
}

export const DEFAULT_SYNC_FILTERS: SyncFilters = {
  tasks: true,
  activities: true,
  leave: true,
  schedules: true,
  importantDates: true,
  childLogs: {
    sleep: true,
    food: true,
    poop: true,
    shower: true,
  },
};

/**
 * Fill in any filter keys missing from stored settings (e.g. "activities"
 * was added after users had already saved filters).
 */
export function normalizeSyncFilters(raw: unknown): SyncFilters {
  const stored = (raw || {}) as Partial<SyncFilters>;
  return {
    ...DEFAULT_SYNC_FILTERS,
    ...stored,
    childLogs: {
      ...DEFAULT_SYNC_FILTERS.childLogs,
      ...(stored.childLogs || {}),
    },
  };
}

// Google Calendar event format
export interface GoogleCalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  colorId?: string;
  extendedProperties?: {
    private?: Record<string, string>;
  };
}

// Token record from database
interface TokenRecord {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_expiry: string;
  calendar_id: string;
  sync_filters: SyncFilters | null;
}

/**
 * Fetch against the Google Calendar API with retry on rate limits and
 * transient server errors. Google's per-user quota (~10 QPS) is easy to hit
 * during a full sync, so 403 rateLimitExceeded / 429 / 5xx are retried with
 * exponential backoff, honoring Retry-After when present.
 */
async function googleFetch(
  url: string,
  init: RequestInit,
  maxAttempts = 5
): Promise<Response> {
  let lastResponse: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      // Network error: retry with backoff
      if (attempt === maxAttempts) throw error;
      await sleep(backoffMs(attempt));
      continue;
    }

    if (response.ok || response.status === 404 || response.status === 410) {
      return response;
    }

    const retryable =
      response.status === 429 ||
      response.status >= 500 ||
      (response.status === 403 && (await isRateLimit403(response.clone())));

    if (!retryable || attempt === maxAttempts) {
      return response;
    }

    const retryAfter = Number(response.headers.get('retry-after'));
    await sleep(retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt));
    lastResponse = response;
  }

  return lastResponse!;
}

async function isRateLimit403(response: Response): Promise<boolean> {
  try {
    const body = await response.json();
    const reason = body?.error?.errors?.[0]?.reason || '';
    return reason === 'rateLimitExceeded' || reason === 'userRateLimitExceeded';
  } catch {
    return false;
  }
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** (attempt - 1), 16000) + Math.floor(Math.random() * 250);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run async tasks over items with bounded concurrency, spacing task starts
 * so we stay under Google's per-user QPS quota.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Get a valid access token for a user, refreshing if necessary
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const supabase = getApiAdminClient();

  const { data: token, error } = await supabase
    .from('google_calendar_tokens')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !token) {
    return null;
  }

  const tokenRecord = token as TokenRecord;
  const expiryDate = new Date(tokenRecord.token_expiry);
  const now = new Date();

  // Check if token expires within 5 minutes
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

  if (expiryDate <= fiveMinutesFromNow) {
    // Token expired or expiring soon, refresh it
    const newToken = await refreshAccessToken(userId, tokenRecord.refresh_token);
    return newToken;
  }

  return tokenRecord.access_token;
}

/**
 * Refresh an expired access token
 */
async function refreshAccessToken(userId: string, refreshToken: string): Promise<string | null> {
  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to refresh token:', errorText);
      // Only drop the connection when Google says the grant itself is dead
      // (revoked or expired refresh token). Transient failures (network,
      // 5xx, rate limits) must not silently disconnect the calendar.
      if (errorText.includes('invalid_grant')) {
        await deleteUserToken(userId);
      }
      return null;
    }

    const data = await response.json();
    const newExpiry = new Date(Date.now() + data.expires_in * 1000);

    // Update token in database
    const supabase = getApiAdminClient();
    await supabase
      .from('google_calendar_tokens')
      .update({
        access_token: data.access_token,
        token_expiry: newExpiry.toISOString(),
      })
      .eq('user_id', userId);

    return data.access_token;
  } catch (error) {
    console.error('Error refreshing token:', error);
    return null;
  }
}

/**
 * Delete a user's token record
 */
export async function deleteUserToken(userId: string): Promise<void> {
  const supabase = getApiAdminClient();
  await supabase
    .from('google_calendar_tokens')
    .delete()
    .eq('user_id', userId);
}

/**
 * Get user's sync filters
 */
export async function getUserSyncFilters(userId: string): Promise<SyncFilters | null> {
  const supabase = getApiAdminClient();

  const { data: token } = await supabase
    .from('google_calendar_tokens')
    .select('sync_filters')
    .eq('user_id', userId)
    .single();

  if (!token) return null;

  return normalizeSyncFilters(token.sync_filters);
}

/**
 * Update user's sync filters
 */
export async function updateUserSyncFilters(userId: string, filters: SyncFilters): Promise<boolean> {
  const supabase = getApiAdminClient();

  const { error } = await supabase
    .from('google_calendar_tokens')
    .update({ sync_filters: filters })
    .eq('user_id', userId);

  return !error;
}

/**
 * Create a Google Calendar event
 */
export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: GoogleCalendarEvent
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    const response = await googleFetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to create calendar event:', errorText);
      return { success: false, error: errorText };
    }

    const data = await response.json();
    return { success: true, eventId: data.id };
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Update a Google Calendar event
 */
export async function updateCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: GoogleCalendarEvent
): Promise<{ success: boolean; notFound?: boolean; error?: string }> {
  try {
    const response = await googleFetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    // The tracked event no longer exists in Google (deleted by hand or by a
    // failed sync). Callers should recreate it instead of failing.
    if (response.status === 404 || response.status === 410) {
      return { success: false, notFound: true, error: `HTTP ${response.status}` };
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to update calendar event:', errorText);
      return { success: false, error: errorText };
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating calendar event:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Delete a Google Calendar event
 */
export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await googleFetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    // 404/410 means already deleted, which is fine
    if (!response.ok && response.status !== 404 && response.status !== 410) {
      const errorText = await response.text();
      console.error('Failed to delete calendar event:', errorText);
      return { success: false, error: errorText };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    return { success: false, error: String(error) };
  }
}

export interface SyncedCalendarEvent {
  id: string;
  summary: string;
  sourceType: string;
  sourceId?: string;
  contentHash?: string;
}

/**
 * List all events created by our sync.
 * We scan a broad date window because the Calendar API does not support
 * querying by only the presence of a private extended property.
 */
export async function listSyncedEvents(
  accessToken: string,
  calendarId: string
): Promise<SyncedCalendarEvent[]> {
  const events: SyncedCalendarEvent[] = [];
  let pageToken: string | undefined;

  const timeMin = new Date();
  timeMin.setFullYear(timeMin.getFullYear() - 1);

  const timeMax = new Date();
  timeMax.setFullYear(timeMax.getFullYear() + 1);

  do {
    const url = new URL(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set('maxResults', '2500');
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('showDeleted', 'false');
    url.searchParams.set('timeMin', timeMin.toISOString());
    url.searchParams.set('timeMax', timeMax.toISOString());
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const response = await googleFetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list synced calendar events: ${await response.text()}`);
    }

    const data = await response.json();
    for (const event of data.items || []) {
      const sourceType = event.extendedProperties?.private?.sourceType;
      if (!event.id || !sourceType) {
        continue;
      }

      events.push({
        id: event.id,
        summary: event.summary || '',
        sourceType,
        sourceId: event.extendedProperties?.private?.sourceId,
        contentHash: event.extendedProperties?.private?.contentHash,
      });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return events;
}

/**
 * Delete all events created by our sync from Google Calendar.
 * Used when disconnecting; the full sync itself reconciles instead.
 */
export async function deleteAllSyncedEvents(
  accessToken: string,
  calendarId: string
): Promise<{ deleted: number; errors: number; total: number }> {
  const events = await listSyncedEvents(accessToken, calendarId);
  if (events.length === 0) {
    return { deleted: 0, errors: 0, total: 0 };
  }

  let deleted = 0;
  let errors = 0;

  const results = await runWithConcurrency(events, 4, (event) =>
    deleteCalendarEvent(accessToken, calendarId, event.id)
  );

  for (const result of results) {
    if (result.success) {
      deleted++;
    } else {
      errors++;
    }
  }

  return { deleted, errors, total: events.length };
}

/**
 * Get user's calendar ID
 */
export async function getUserCalendarId(userId: string): Promise<string | null> {
  const supabase = getApiAdminClient();

  const { data: token } = await supabase
    .from('google_calendar_tokens')
    .select('calendar_id')
    .eq('user_id', userId)
    .single();

  return token?.calendar_id || null;
}

/**
 * Check if a user has connected their Google Calendar
 */
export async function isUserConnected(userId: string): Promise<boolean> {
  const supabase = getApiAdminClient();

  const { data } = await supabase
    .from('google_calendar_tokens')
    .select('id')
    .eq('user_id', userId)
    .single();

  return !!data;
}

/**
 * Get all users who have a specific filter enabled
 */
export async function getUsersWithFilterEnabled(
  filterPath: string
): Promise<string[]> {
  const supabase = getApiAdminClient();

  // Get all connected users
  const { data: tokens } = await supabase
    .from('google_calendar_tokens')
    .select('user_id, sync_filters');

  if (!tokens) return [];

  return tokens
    .filter((token) => {
      const filters = normalizeSyncFilters(token.sync_filters);
      // Navigate the filter path (e.g., "tasks" or "childLogs.sleep")
      const parts = filterPath.split('.');
      let value: unknown = filters;
      for (const part of parts) {
        if (value && typeof value === 'object') {
          value = (value as Record<string, unknown>)[part];
        } else {
          return false;
        }
      }
      return value === true;
    })
    .map((token) => token.user_id);
}
