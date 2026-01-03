import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getApiAdminClient } from '@/lib/supabase/api-helpers';

// POST handler for approving a leave request
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: requestId } = await params;
    const body = await request.json().catch(() => ({}));
    const adminNotes = body.adminNotes;

    const supabase = await createClient();
    const supabaseAdmin = getApiAdminClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if user is admin
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can approve leave requests' }, { status: 403 });
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

    if (leaveRequest.status !== 'pending') {
      return NextResponse.json({ error: 'Leave request is not pending' }, { status: 400 });
    }

    // Update leave request
    const { error: updateError } = await supabaseAdmin
      .from('leave_requests')
      .update({
        status: 'approved',
        admin_notes: adminNotes || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('Leave request approval error:', updateError);
      return NextResponse.json({ error: 'Failed to approve leave request' }, { status: 500 });
    }

    // Update leave balance
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
      const newUsed = currentUsed + parseFloat(leaveRequest.total_days);

      await supabaseAdmin
        .from('leave_balances')
        .update({ [updateField]: newUsed })
        .eq('id', balance.id);
    } else {
      const vacationUsed = leaveRequest.leave_type === 'vacation' ? parseFloat(leaveRequest.total_days) : 0;
      const sickUsed = leaveRequest.leave_type === 'sick' ? parseFloat(leaveRequest.total_days) : 0;

      await supabaseAdmin
        .from('leave_balances')
        .insert({
          user_id: leaveRequest.user_id,
          year: requestYear,
          vacation_used: vacationUsed,
          sick_used: sickUsed,
        });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Leave request approval error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
