import { NextResponse, after } from 'next/server';
import { requireApiAdminRole, getApiAdminClient, handleApiError } from '@/lib/supabase/api-helpers';
import { sendBookingRequestPush } from '@/lib/notifications/push-service';
import { formatTime12h } from '@/lib/format-time';

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

    if (!babysitterId || !requestDate || !startTime || !endTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = getApiAdminClient();

    // The target must be in the Babysitter group
    const { data: memberships } = await supabase
      .from('employee_group_memberships')
      .select('group:employee_groups!inner(name)')
      .eq('user_id', babysitterId);

    const isBabysitter = (memberships || []).some((m) => {
      const group = m.group as { name: string } | { name: string }[] | null;
      const name = Array.isArray(group) ? group[0]?.name : group?.name;
      return name && ['babysitter', 'babysitters'].includes(name.toLowerCase());
    });

    if (!isBabysitter) {
      return NextResponse.json({ error: 'User is not a babysitter' }, { status: 400 });
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
