import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthUser, getApiAdminClient } from '@/lib/supabase/api-helpers';
import { type SyncFilters } from '@/lib/google-calendar/calendar-service';

export async function PUT(request: NextRequest) {
  try {
    const user = await getApiAuthUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const filters = body.filters as SyncFilters;

    if (!filters) {
      return NextResponse.json({ error: 'Missing filters' }, { status: 400 });
    }

    const supabase = getApiAdminClient();

    const { error } = await supabase
      .from('google_calendar_tokens')
      .update({
        sync_filters: filters,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (error) {
      console.error('Error updating filters:', error);
      return NextResponse.json(
        { error: 'Failed to update settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Settings update error:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
