import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getApiAdminClient } from '@/lib/supabase/api-helpers';

// POST handler for rejecting a supply request
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
      return NextResponse.json({ error: 'Only admins can reject supply requests' }, { status: 403 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('supply_requests')
      .update({
        status: 'rejected',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        admin_notes: adminNotes || null,
      })
      .eq('id', requestId);

    if (updateError) {
      console.error('Supply request rejection error:', updateError);
      return NextResponse.json({ error: 'Failed to reject supply request' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Supply request rejection error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
