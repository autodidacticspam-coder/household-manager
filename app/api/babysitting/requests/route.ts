import { NextResponse, after } from 'next/server';
import { requireApiAdminRole, getApiAdminClient, handleApiError } from '@/lib/supabase/api-helpers';
import {
  getAvailabilityWeekStart,
  getEffectiveAvailabilityRanges,
  isAvailabilityWindowCovered,
} from '@/lib/babysitting/availability';
import { formatDateString, parseLocalDate } from '@/lib/date-utils';
import { sendBookingRequestPush } from '@/lib/notifications/push-service';
import { formatTime12h } from '@/lib/format-time';
import { getZonedDateString } from '@/lib/timezone';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  return formatDateString(parseLocalDate(value)) === value;
}

function isValidTime(value: unknown): value is string {
  if (typeof value !== 'string' || !TIME_RE.test(value)) return false;
  const [hour, minute] = value.split(':').map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function formatRequestDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export async function POST(request: Request) {
  try {
    const { user } = await requireApiAdminRole();

    const body = await request.json();
    const { babysitterId, requestDate, startTime, endTime, note } = body;

    if (
      typeof babysitterId !== 'string' ||
      !isValidDate(requestDate) ||
      !isValidTime(startTime) ||
      !isValidTime(endTime)
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (endTime <= startTime) {
      return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 });
    }

    if (requestDate < getZonedDateString(new Date())) {
      return NextResponse.json({ error: 'Past dates cannot be requested' }, { status: 400 });
    }

    const supabase = getApiAdminClient();

    // The target must be in the Babysitter group
    const { data: memberships, error: membershipError } = await supabase
      .from('employee_group_memberships')
      .select('group:employee_groups!inner(name)')
      .eq('user_id', babysitterId);
    if (membershipError) throw membershipError;

    const isBabysitter = (memberships || []).some((m) => {
      const group = m.group as { name: string } | { name: string }[] | null;
      const name = Array.isArray(group) ? group[0]?.name : group?.name;
      return name && ['babysitter', 'babysitters'].includes(name.toLowerCase());
    });

    if (!isBabysitter) {
      return NextResponse.json({ error: 'User is not a babysitter' }, { status: 400 });
    }

    // Do not trust the browser's cached finder state. Re-check availability on
    // the server, including declined requests, immediately before inserting.
    const weekStart = getAvailabilityWeekStart(requestDate);
    const { data: week, error: weekError } = await supabase
      .from('babysitter_availability_weeks')
      .select('id')
      .eq('user_id', babysitterId)
      .eq('week_start', weekStart)
      .maybeSingle();
    if (weekError) throw weekError;

    const [availabilityResult, declinedResult, activeRequestResult] = await Promise.all([
      week
        ? supabase
            .from('babysitter_availability_entries')
            .select('start_time, end_time')
            .eq('user_id', babysitterId)
            .eq('entry_date', requestDate)
        : supabase
            .from('babysitter_availability_templates')
            .select('start_time, end_time')
            .eq('user_id', babysitterId)
            .eq('day_of_week', parseLocalDate(requestDate).getDay()),
      supabase
        .from('babysitter_booking_requests')
        .select('start_time, end_time')
        .eq('babysitter_id', babysitterId)
        .eq('request_date', requestDate)
        .eq('status', 'declined'),
      supabase
        .from('babysitter_booking_requests')
        .select('id')
        .eq('babysitter_id', babysitterId)
        .eq('request_date', requestDate)
        .in('status', ['pending', 'accepted'])
        .lt('start_time', endTime)
        .gt('end_time', startTime)
        .limit(1),
    ]);
    if (availabilityResult.error) throw availabilityResult.error;
    if (declinedResult.error) throw declinedResult.error;
    if (activeRequestResult.error) throw activeRequestResult.error;

    if ((activeRequestResult.data || []).length > 0) {
      return NextResponse.json({ error: 'An active request already overlaps this time' }, { status: 409 });
    }

    const statedAvailability = (availabilityResult.data || []).map((range) => ({
      startTime: range.start_time.slice(0, 5),
      endTime: range.end_time.slice(0, 5),
    }));
    const declinedRanges = (declinedResult.data || []).map((range) => ({
      startTime: range.start_time.slice(0, 5),
      endTime: range.end_time.slice(0, 5),
    }));
    const effectiveAvailability = getEffectiveAvailabilityRanges(statedAvailability, declinedRanges);

    if (!isAvailabilityWindowCovered(effectiveAvailability, startTime, endTime)) {
      return NextResponse.json({ error: 'Babysitter is not available for this time' }, { status: 409 });
    }

    const { data: bookingRequest, error } = await supabase
      .from('babysitter_booking_requests')
      .insert({
        babysitter_id: babysitterId,
        request_date: requestDate,
        start_time: startTime,
        end_time: endTime,
        note: note || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating booking request:', error);
      return NextResponse.json({ error: 'Failed to create booking request' }, { status: 500 });
    }

    const dateLabel = formatRequestDateLabel(requestDate);
    const timeLabel = `${formatTime12h(startTime)} - ${formatTime12h(endTime)}`;
    after(sendBookingRequestPush([babysitterId], dateLabel, timeLabel, note).catch((err) =>
      console.error('Error sending booking request push:', err)
    ));

    return NextResponse.json(bookingRequest);
  } catch (error) {
    const { error: message, status } = handleApiError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
