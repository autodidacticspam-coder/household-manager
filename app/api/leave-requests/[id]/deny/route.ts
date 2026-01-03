import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getApiAdminClient } from '@/lib/supabase/api-helpers';

// POST handler for denying a leave request
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
      return NextResponse.json({ error: 'Only admins can deny leave requests' }, { status: 403 });
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
        status: 'denied',
        admin_notes: adminNotes || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('Leave request denial error:', updateError);
      return NextResponse.json({ error: 'Failed to deny leave request' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Leave request denial error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
