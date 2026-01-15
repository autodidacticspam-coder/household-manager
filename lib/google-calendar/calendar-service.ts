import { getApiAdminClient } from '@/lib/supabase/api-helpers';

// Google Calendar API URLs
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

// Sync filter types
export interface SyncFilters {
  tasks: boolean;
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
      console.error('Failed to refresh token:', await response.text());
      // Token might be revoked, clean up
      await deleteUserToken(userId);
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

  return (token.sync_filters as SyncFilters) || DEFAULT_SYNC_FILTERS;
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
    const response = await fetch(
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
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
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
    const response = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    // 404 means already deleted, which is fine
    if (!response.ok && response.status !== 404) {
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
      const filters = (token.sync_filters as SyncFilters) || DEFAULT_SYNC_FILTERS;
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
