'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { format, startOfWeek, addDays } from 'date-fns';
import { parseLocalDate } from '@/lib/date-utils';
import type {
  AvailabilityRange,
  AvailabilityTemplateSlot,
  AvailabilityEntry,
  AvailabilityWeek,
  BabysitterUser,
  BabysitterWeekAvailability,
  BookingRequest,
  BookingRequestStatus,
} from '@/types';

export const BABYSITTER_GROUP_NAMES = ['babysitter', 'babysitters'];

// Sunday-start week, matching employee_schedules.day_of_week (0 = Sunday)
export function getWeekStart(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: 0 }), 'yyyy-MM-dd');
}

export function getWeekDates(weekStart: string): string[] {
  const start = parseLocalDate(weekStart);
  return Array.from({ length: 7 }, (_, i) => format(addDays(start, i), 'yyyy-MM-dd'));
}

// Check if the current user is in the Babysitter group (admins excluded)
export function useIsBabysitter() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['is-babysitter'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data: membership } = await supabase
        .from('employee_group_memberships')
        .select(`group:employee_groups!inner(name)`)
        .eq('user_id', user.id);

      if (!membership) return false;
      return membership.some((m) => {
        const group = m.group as { name: string } | { name: string }[] | null;
        if (!group) return false;
        const groupName = Array.isArray(group) ? group[0]?.name : group.name;
        return groupName && BABYSITTER_GROUP_NAMES.includes(groupName.toLowerCase());
      });
    },
  });
}

// All users in the Babysitter group (admin view)
export function useBabysitters() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['babysitters'],
    queryFn: async (): Promise<BabysitterUser[]> => {
      const { data: groups, error: groupsError } = await supabase
        .from('employee_groups')
        .select('id, name');
      if (groupsError) throw groupsError;

      const groupIds = (groups || [])
        .filter((g) => BABYSITTER_GROUP_NAMES.includes(g.name.toLowerCase()))
        .map((g) => g.id);
      if (groupIds.length === 0) return [];

      const { data: members, error: membersError } = await supabase
        .from('employee_group_memberships')
        .select('user_id, user:users!inner(id, full_name, avatar_url)')
        .in('group_id', groupIds);
      if (membersError) throw membersError;

      const seen = new Set<string>();
      const sitters: BabysitterUser[] = [];
      for (const m of members || []) {
        const raw = m.user as { id: string; full_name: string; avatar_url: string | null } | { id: string; full_name: string; avatar_url: string | null }[] | null;
        const user = Array.isArray(raw) ? raw[0] : raw;
        if (user && !seen.has(user.id)) {
          seen.add(user.id);
          sitters.push({ id: user.id, fullName: user.full_name, avatarUrl: user.avatar_url });
        }
      }
      return sitters.sort((a, b) => a.fullName.localeCompare(b.fullName));
    },
  });
}

// ============================================
// Babysitter side: template + weekly entries
// ============================================

export function useMyAvailabilityTemplate(userId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['bs-availability-template', userId],
    queryFn: async (): Promise<AvailabilityTemplateSlot[]> => {
      const { data, error } = await supabase
        .from('babysitter_availability_templates')
        .select('*')
        .eq('user_id', userId)
        .order('day_of_week')
        .order('start_time');
      if (error) throw error;
      return (data || []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        dayOfWeek: row.day_of_week,
        startTime: row.start_time.slice(0, 5),
        endTime: row.end_time.slice(0, 5),
      }));
    },
    enabled: !!userId,
  });
}

export function useSaveAvailabilityTemplate() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ userId, slots }: { userId: string; slots: { dayOfWeek: number; startTime: string; endTime: string }[] }) => {
      const { error: deleteError } = await supabase
        .from('babysitter_availability_templates')
        .delete()
        .eq('user_id', userId);
      if (deleteError) throw deleteError;

      if (slots.length > 0) {
        const { error: insertError } = await supabase
          .from('babysitter_availability_templates')
          .insert(slots.map((s) => ({
            user_id: userId,
            day_of_week: s.dayOfWeek,
            start_time: s.startTime,
            end_time: s.endTime,
          })));
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bs-availability-template'] });
      queryClient.invalidateQueries({ queryKey: ['bs-admin-availability'] });
      toast.success(t('common.saved'));
    },
    onError: (error) => {
      console.error('Error saving availability template:', error);
      toast.error(t('errors.saveFailed'));
    },
  });
}

// Week rows + entries for a set of weeks (babysitter's own)
export function useMyWeekAvailability(userId: string | undefined, weekStarts: string[]) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['bs-availability-weeks', userId, weekStarts],
    queryFn: async (): Promise<{ weeks: AvailabilityWeek[]; entries: AvailabilityEntry[] }> => {
      if (weekStarts.length === 0) return { weeks: [], entries: [] };
      const firstDate = weekStarts[0];
      const lastDate = format(addDays(parseLocalDate(weekStarts[weekStarts.length - 1]), 6), 'yyyy-MM-dd');

      const [{ data: weeks, error: weeksError }, { data: entries, error: entriesError }] = await Promise.all([
        supabase
          .from('babysitter_availability_weeks')
          .select('*')
          .eq('user_id', userId)
          .in('week_start', weekStarts),
        supabase
          .from('babysitter_availability_entries')
          .select('*')
          .eq('user_id', userId)
          .gte('entry_date', firstDate)
          .lte('entry_date', lastDate)
          .order('entry_date')
          .order('start_time'),
      ]);
      if (weeksError) throw weeksError;
      if (entriesError) throw entriesError;

      return {
        weeks: (weeks || []).map((row) => ({
          id: row.id,
          userId: row.user_id,
          weekStart: row.week_start,
          updatedAt: row.updated_at,
        })),
        entries: (entries || []).map((row) => ({
          id: row.id,
          userId: row.user_id,
          entryDate: row.entry_date,
          startTime: row.start_time.slice(0, 5),
          endTime: row.end_time.slice(0, 5),
        })),
      };
    },
    enabled: !!userId && weekStarts.length > 0,
  });
}

export function useSaveWeekAvailability() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ userId, weekStart, entries }: {
      userId: string;
      weekStart: string;
      entries: { entryDate: string; startTime: string; endTime: string }[];
    }) => {
      const weekEnd = format(addDays(parseLocalDate(weekStart), 6), 'yyyy-MM-dd');

      const { error: weekError } = await supabase
        .from('babysitter_availability_weeks')
        .upsert(
          { user_id: userId, week_start: weekStart, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,week_start' }
        );
      if (weekError) throw weekError;

      const { error: deleteError } = await supabase
        .from('babysitter_availability_entries')
        .delete()
        .eq('user_id', userId)
        .gte('entry_date', weekStart)
        .lte('entry_date', weekEnd);
      if (deleteError) throw deleteError;

      if (entries.length > 0) {
        const { error: insertError } = await supabase
          .from('babysitter_availability_entries')
          .insert(entries.map((e) => ({
            user_id: userId,
            entry_date: e.entryDate,
            start_time: e.startTime,
            end_time: e.endTime,
          })));
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bs-availability-weeks'] });
      queryClient.invalidateQueries({ queryKey: ['bs-admin-availability'] });
      toast.success(t('common.saved'));
    },
    onError: (error) => {
      console.error('Error saving week availability:', error);
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useResetWeekAvailability() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ userId, weekStart }: { userId: string; weekStart: string }) => {
      const weekEnd = format(addDays(parseLocalDate(weekStart), 6), 'yyyy-MM-dd');

      const { error: entriesError } = await supabase
        .from('babysitter_availability_entries')
        .delete()
        .eq('user_id', userId)
        .gte('entry_date', weekStart)
        .lte('entry_date', weekEnd);
      if (entriesError) throw entriesError;

      const { error: weekError } = await supabase
        .from('babysitter_availability_weeks')
        .delete()
        .eq('user_id', userId)
        .eq('week_start', weekStart);
      if (weekError) throw weekError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bs-availability-weeks'] });
      queryClient.invalidateQueries({ queryKey: ['bs-admin-availability'] });
      toast.success(t('common.saved'));
    },
    onError: (error) => {
      console.error('Error resetting week availability:', error);
      toast.error(t('errors.saveFailed'));
    },
  });
}

// ============================================
// Admin side: everyone's availability for a week
// ============================================

export function useAdminBabysitterAvailability(weekStart: string) {
  const supabase = createClient();
  const { data: sitters } = useBabysitters();

  return useQuery({
    queryKey: ['bs-admin-availability', weekStart, (sitters || []).map((s) => s.id)],
    queryFn: async (): Promise<BabysitterWeekAvailability[]> => {
      const sitterIds = (sitters || []).map((s) => s.id);
      if (sitterIds.length === 0) return [];
      const weekEnd = format(addDays(parseLocalDate(weekStart), 6), 'yyyy-MM-dd');

      const [templatesRes, weeksRes, entriesRes] = await Promise.all([
        supabase
          .from('babysitter_availability_templates')
          .select('*')
          .in('user_id', sitterIds)
          .order('start_time'),
        supabase
          .from('babysitter_availability_weeks')
          .select('*')
          .in('user_id', sitterIds)
          .eq('week_start', weekStart),
        supabase
          .from('babysitter_availability_entries')
          .select('*')
          .in('user_id', sitterIds)
          .gte('entry_date', weekStart)
          .lte('entry_date', weekEnd)
          .order('start_time'),
      ]);
      if (templatesRes.error) throw templatesRes.error;
      if (weeksRes.error) throw weeksRes.error;
      if (entriesRes.error) throw entriesRes.error;

      const weekDates = getWeekDates(weekStart);

      return (sitters || []).map((user) => {
        const weekRow = (weeksRes.data || []).find((w) => w.user_id === user.id);
        const days: Record<number, AvailabilityRange[]> = {};

        if (weekRow) {
          for (let dow = 0; dow < 7; dow++) {
            days[dow] = (entriesRes.data || [])
              .filter((e) => e.user_id === user.id && e.entry_date === weekDates[dow])
              .map((e) => ({ startTime: e.start_time.slice(0, 5), endTime: e.end_time.slice(0, 5) }));
          }
        } else {
          for (let dow = 0; dow < 7; dow++) {
            days[dow] = (templatesRes.data || [])
              .filter((s) => s.user_id === user.id && s.day_of_week === dow)
              .map((s) => ({ startTime: s.start_time.slice(0, 5), endTime: s.end_time.slice(0, 5) }));
          }
        }

        return {
          user,
          weekStart,
          confirmed: !!weekRow,
          confirmedAt: weekRow?.updated_at || null,
          days,
        };
      });
    },
    enabled: !!weekStart && sitters !== undefined,
  });
}

// Existing shifts for the babysitters in a week (for conflict badges).
// Returns ranges keyed by `${userId}|${yyyy-MM-dd}`.
export function useBabysitterShifts(weekStart: string, sitterIds: string[]) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['bs-shifts', weekStart, sitterIds],
    queryFn: async (): Promise<Record<string, AvailabilityRange[]>> => {
      if (sitterIds.length === 0) return {};
      const weekEnd = format(addDays(parseLocalDate(weekStart), 6), 'yyyy-MM-dd');
      const weekDates = getWeekDates(weekStart);

      const [schedulesRes, overridesRes, oneOffsRes] = await Promise.all([
        supabase
          .from('employee_schedules')
          .select('*')
          .in('user_id', sitterIds)
          .eq('is_active', true),
        supabase
          .from('schedule_overrides')
          .select('*')
          .gte('override_date', weekStart)
          .lte('override_date', weekEnd),
        supabase
          .from('schedule_one_offs')
          .select('*')
          .in('user_id', sitterIds)
          .gte('schedule_date', weekStart)
          .lte('schedule_date', weekEnd),
      ]);
      if (schedulesRes.error) throw schedulesRes.error;
      if (oneOffsRes.error) throw oneOffsRes.error;

      const shifts: Record<string, AvailabilityRange[]> = {};
      const add = (userId: string, date: string, startTime: string, endTime: string) => {
        const key = `${userId}|${date}`;
        if (!shifts[key]) shifts[key] = [];
        shifts[key].push({ startTime: startTime.slice(0, 5), endTime: endTime.slice(0, 5) });
      };

      for (const schedule of schedulesRes.data || []) {
        const date = weekDates[schedule.day_of_week];
        if (!date) continue;
        const override = (overridesRes.data || []).find(
          (o) => o.schedule_id === schedule.id && o.override_date === date
        );
        if (override?.is_cancelled) continue;
        add(
          schedule.user_id,
          date,
          override?.start_time || schedule.start_time,
          override?.end_time || schedule.end_time
        );
      }
      for (const oneOff of oneOffsRes.data || []) {
        add(oneOff.user_id, oneOff.schedule_date, oneOff.start_time, oneOff.end_time);
      }
      return shifts;
    },
    enabled: !!weekStart && sitterIds.length > 0,
  });
}

// ============================================
// Booking requests
// ============================================

function transformBookingRequest(row: Record<string, unknown>): BookingRequest {
  const rawSitter = row.babysitter as { id: string; full_name: string; avatar_url: string | null } | { id: string; full_name: string; avatar_url: string | null }[] | null;
  const sitter = Array.isArray(rawSitter) ? rawSitter[0] : rawSitter;
  return {
    id: row.id as string,
    babysitterId: row.babysitter_id as string,
    requestDate: row.request_date as string,
    startTime: (row.start_time as string).slice(0, 5),
    endTime: (row.end_time as string).slice(0, 5),
    note: row.note as string | null,
    status: row.status as BookingRequestStatus,
    oneOffId: row.one_off_id as string | null,
    createdBy: row.created_by as string | null,
    respondedAt: row.responded_at as string | null,
    createdAt: row.created_at as string,
    babysitter: sitter
      ? { id: sitter.id, fullName: sitter.full_name, avatarUrl: sitter.avatar_url }
      : undefined,
  };
}

// RLS scopes this automatically: admins see all, babysitters see their own
export function useBookingRequests() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['bs-booking-requests'],
    queryFn: async (): Promise<BookingRequest[]> => {
      const { data, error } = await supabase
        .from('babysitter_booking_requests')
        .select('*, babysitter:users!babysitter_booking_requests_babysitter_id_fkey(id, full_name, avatar_url)')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []).map(transformBookingRequest);
    },
  });
}

export function useCreateBookingRequest() {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (data: {
      babysitterId: string;
      requestDate: string;
      startTime: string;
      endTime: string;
      note?: string;
    }) => {
      const response = await fetch('/api/babysitting/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create booking request');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bs-booking-requests'] });
      toast.success(t('babysitting.requestSent'));
    },
    onError: (error) => {
      console.error('Error creating booking request:', error);
      toast.error(t('errors.saveFailed'));
    },
  });
}

export function useRespondBookingRequest() {
  const queryClient = useQueryClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'accept' | 'decline' | 'cancel' }) => {
      const response = await fetch(`/api/babysitting/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update booking request');
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['bs-booking-requests'] });
      queryClient.invalidateQueries({ queryKey: ['bs-shifts'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      queryClient.invalidateQueries({ queryKey: ['one-off-schedules'] });
      if (variables.action === 'accept') {
        toast.success(t('babysitting.requestAccepted'));
      } else if (variables.action === 'decline') {
        toast.success(t('babysitting.requestDeclined'));
      } else {
        toast.success(t('babysitting.requestCancelled'));
      }
    },
    onError: (error) => {
      console.error('Error responding to booking request:', error);
      toast.error(t('errors.saveFailed'));
    },
  });
}
