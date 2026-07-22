import { NextResponse, after } from 'next/server';
import { getApiAuthUser, getApiAdminClient, handleApiError } from '@/lib/supabase/api-helpers';
import { syncOneOffScheduleChange } from '@/lib/google-calendar/sync-service';
import { sendBookingCancellationPush, sendBookingResponsePush } from '@/lib/notifications/push-service';
import { formatTime12h } from '@/lib/format-time';
import { getZonedDateString } from '@/lib/timezone';

function formatRequestDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getApiAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = await params;
    const { action } = await request.json();

    if (!['accept', 'decline', 'cancel'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const supabase = getApiAdminClient();

    const { data: bookingRequest, error: fetchError } = await supabase
      .from('babysitter_booking_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !bookingRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role, full_name')
      .eq('id', user.id)
      .single();

    if (action === 'cancel') {
      // Cancelling is an admin action. Pending requests are simply withdrawn;
      // accepted requests also remove the one-off shift created on acceptance.
      if (userData?.role !== 'admin') {
        return NextResponse.json({ error: 'Only admins can cancel requests' }, { status: 403 });
      }

      if (!['pending', 'accepted'].includes(bookingRequest.status)) {
        return NextResponse.json({ error: 'This request cannot be cancelled' }, { status: 409 });
      }

      if (
        bookingRequest.status === 'accepted' &&
        bookingRequest.request_date < getZonedDateString(new Date())
      ) {
        return NextResponse.json({ error: 'Past shifts cannot be cancelled' }, { status: 409 });
      }

      const previousStatus = bookingRequest.status;
      const previousRespondedAt = bookingRequest.responded_at;
      const oneOffId = bookingRequest.one_off_id as string | null;

      const { data: updated, error } = await supabase
        .from('babysitter_booking_requests')
        .update({
          status: 'cancelled',
          responded_at: new Date().toISOString(),
          ...(previousStatus === 'accepted' ? { one_off_id: null } : {}),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error cancelling booking request:', error);
        return NextResponse.json({ error: 'Failed to cancel request' }, { status: 500 });
      }

      if (previousStatus === 'accepted' && oneOffId) {
        const { error: deleteError } = await supabase
          .from('schedule_one_offs')
          .delete()
          .eq('id', oneOffId);

        if (deleteError) {
          // Restore the request if its linked schedule could not be removed.
          const { error: rollbackError } = await supabase
            .from('babysitter_booking_requests')
            .update({
              status: previousStatus,
              responded_at: previousRespondedAt,
              one_off_id: oneOffId,
            })
            .eq('id', id);
          if (rollbackError) {
            console.error('Error restoring booking request after cancellation failure:', rollbackError);
          }
          console.error('Error deleting accepted babysitting shift:', deleteError);
          return NextResponse.json({ error: 'Failed to cancel the shift' }, { status: 500 });
        }

        after(syncOneOffScheduleChange(oneOffId, 'delete').catch((err) =>
          console.error('Error syncing cancelled babysitting shift to Google Calendar:', err)
        ));
      }

      const dateLabel = formatRequestDateLabel(bookingRequest.request_date);
      const timeLabel = `${formatTime12h(bookingRequest.start_time)} - ${formatTime12h(bookingRequest.end_time)}`;
      after(sendBookingCancellationPush(
        [bookingRequest.babysitter_id],
        dateLabel,
        timeLabel,
        previousStatus === 'accepted'
      ).catch((err) => console.error('Error sending booking cancellation push:', err)));

      return NextResponse.json(updated);
    }

    if (bookingRequest.status !== 'pending') {
      return NextResponse.json({ error: 'This request has already been handled' }, { status: 409 });
    }

    // accept / decline: only the babysitter the request was sent to
    if (bookingRequest.babysitter_id !== user.id) {
      return NextResponse.json({ error: 'You can only respond to your own requests' }, { status: 403 });
    }

    let oneOffId: string | null = null;

    if (action === 'accept') {
      // Accepting creates the actual shift on the babysitter's schedule
      const { data: oneOff, error: oneOffError } = await supabase
        .from('schedule_one_offs')
        .insert({
          user_id: bookingRequest.babysitter_id,
          schedule_date: bookingRequest.request_date,
          start_time: bookingRequest.start_time,
          end_time: bookingRequest.end_time,
          created_by: bookingRequest.created_by,
        })
        .select()
        .single();

      if (oneOffError || !oneOff) {
        console.error('Error creating shift from booking request:', oneOffError);
        return NextResponse.json({ error: 'Failed to create the shift' }, { status: 500 });
      }
      oneOffId = oneOff.id;

      after(syncOneOffScheduleChange(oneOff.id, 'create', {
        userId: bookingRequest.babysitter_id,
        scheduleDate: bookingRequest.request_date,
        startTime: bookingRequest.start_time,
        endTime: bookingRequest.end_time,
      }).catch((err) => console.error('Error syncing accepted booking to Google Calendar:', err)));
    }

    const { data: updated, error: updateError } = await supabase
      .from('babysitter_booking_requests')
      .update({
        status: action === 'accept' ? 'accepted' : 'declined',
        responded_at: new Date().toISOString(),
        ...(oneOffId ? { one_off_id: oneOffId } : {}),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating booking request:', updateError);
      return NextResponse.json({ error: 'Failed to update request' }, { status: 500 });
    }

    // Notify all admins of the response
    const { data: admins } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'admin');

    const adminIds = (admins || []).map((a) => a.id);
    if (adminIds.length > 0) {
      const dateLabel = formatRequestDateLabel(bookingRequest.request_date);
      const timeLabel = `${formatTime12h(bookingRequest.start_time)} - ${formatTime12h(bookingRequest.end_time)}`;
      after(sendBookingResponsePush(
        adminIds,
        userData?.full_name || 'A babysitter',
        action === 'accept',
        dateLabel,
        timeLabel
      ).catch((err) => console.error('Error sending booking response push:', err)));
    }

    return NextResponse.json(updated);
  } catch (error) {
    const { error: message, status } = handleApiError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
