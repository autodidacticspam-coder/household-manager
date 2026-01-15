import { NextResponse } from 'next/server';
import { getApiAuthUser, getApiAdminClient } from '@/lib/supabase/api-helpers';
import { DEFAULT_SYNC_FILTERS, type SyncFilters } from '@/lib/google-calendar/calendar-service';

export async function GET() {
  try {
    const user = await getApiAuthUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getApiAdminClient();

    const { data: token } = await supabase
      .from('google_calendar_tokens')
      .select('calendar_id, sync_filters, google_email, updated_at')
      .eq('user_id', user.id)
      .single();

    if (!token) {
      return NextResponse.json({
        connected: false,
        filters: DEFAULT_SYNC_FILTERS,
      });
    }

    return NextResponse.json({
      connected: true,
      email: token.google_email || null,
      calendarId: token.calendar_id,
      filters: (token.sync_filters as SyncFilters) || DEFAULT_SYNC_FILTERS,
      lastSynced: token.updated_at,
    });
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: 'Failed to check status' },
      { status: 500 }
    );
  }
}
