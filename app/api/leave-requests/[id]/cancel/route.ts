import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getApiAdminClient } from '@/lib/supabase/api-helpers';

// DELETE handler for cancelling a leave request
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: requestId } = await params;

    const supabase = await createClient();
    const supabaseAdmin = getApiAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get the leave request
    const { data: leaveRequest, error: fetchError } = await supabaseAdmin
      .from('leave_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !leaveRequest) {
      return NextResponse.json({ error: 'Leave request not found' }, { status: 404 });
    }

    // Check if user owns this request or is admin
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    const isAdmin = userData?.role === 'admin';
    const isOwner = leaveRequest.user_id === user.id;

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'You can only cancel your own leave requests' }, { status: 403 });
    }

    // Non-admins can only cancel pending requests
    if (!isAdmin && leaveRequest.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending leave requests can be cancelled' }, { status: 400 });
    }

    // If the request was approved, restore the leave balance
    if (leaveRequest.status === 'approved') {
      const requestYear = new Date(leaveRequest.start_date).getFullYear();
      const { data: balance } = await supabaseAdmin
        .from('leave_balances')
        .select('*')
        .eq('user_id', leaveRequest.user_id)
        .eq('year', requestYear)
        .single();

      if (balance) {
        const updateField = leaveRequest.leave_type === 'vacation' ? 'vacation_used' : 'sick_used';
        const currentUsed = parseFloat(balance[updateField]);
        const newUsed = Math.max(0, currentUsed - parseFloat(leaveRequest.total_days));

        await supabaseAdmin
          .from('leave_balances')
          .update({ [updateField]: newUsed })
          .eq('id', balance.id);
      }
    }

    // Delete the request
    const { error: deleteError } = await supabaseAdmin
      .from('leave_requests')
      .delete()
      .eq('id', requestId);

    if (deleteError) {
      console.error('Leave request cancellation error:', deleteError);
      return NextResponse.json({ error: 'Failed to cancel leave request' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Leave request cancellation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
