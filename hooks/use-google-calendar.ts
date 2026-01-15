import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Sync filter types (duplicated from calendar-service to avoid server-side imports)
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

interface GoogleCalendarStatus {
  connected: boolean;
  email?: string;
  calendarId?: string;
  filters: SyncFilters;
  lastSynced?: string;
}

async function fetchStatus(): Promise<GoogleCalendarStatus> {
  const response = await fetch('/api/google-calendar/status');
  if (!response.ok) {
    throw new Error('Failed to fetch status');
  }
  return response.json();
}

async function getAuthUrl(): Promise<string> {
  const response = await fetch('/api/google-calendar/auth');
  if (!response.ok) {
    throw new Error('Failed to get auth URL');
  }
  const data = await response.json();
  return data.url;
}

async function disconnect(): Promise<void> {
  const response = await fetch('/api/google-calendar/disconnect', {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to disconnect');
  }
}

async function updateFilters(filters: SyncFilters): Promise<void> {
  const response = await fetch('/api/google-calendar/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filters }),
  });
  if (!response.ok) {
    throw new Error('Failed to update filters');
  }
}

async function triggerSync(): Promise<void> {
  const response = await fetch('/api/google-calendar/sync', {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to sync');
  }
}

export function useGoogleCalendarStatus() {
  return useQuery({
    queryKey: ['google-calendar-status'],
    queryFn: fetchStatus,
    staleTime: 30000, // 30 seconds
  });
}

export function useGoogleCalendarConnect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const url = await getAuthUrl();
      // Open the auth URL in the same window
      window.location.href = url;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
    },
  });
}

export function useGoogleCalendarDisconnect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: disconnect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
    },
  });
}

export function useGoogleCalendarFilters() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateFilters,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
    },
  });
}

export function useGoogleCalendarSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: triggerSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
    },
  });
}
