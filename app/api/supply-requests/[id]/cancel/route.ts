import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// DELETE handler for cancelling a supply request
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: requestId } = await params;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if request exists and belongs to user
    const { data: supplyRequest, error: fetchError } = await supabase
      .from('supply_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !supplyRequest) {
      return NextResponse.json({ error: 'Supply request not found' }, { status: 404 });
    }

    if (supplyRequest.user_id !== user.id) {
      return NextResponse.json({ error: 'You can only cancel your own requests' }, { status: 403 });
    }

    if (supplyRequest.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending requests can be cancelled' }, { status: 400 });
    }

    const { error: deleteError } = await supabase
      .from('supply_requests')
      .delete()
      .eq('id', requestId);

    if (deleteError) {
      console.error('Supply request cancellation error:', deleteError);
      return NextResponse.json({ error: 'Failed to cancel supply request' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Supply request cancellation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
