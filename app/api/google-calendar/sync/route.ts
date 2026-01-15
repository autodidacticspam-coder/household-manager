import { NextResponse } from 'next/server';
import { getApiAuthUser } from '@/lib/supabase/api-helpers';
import { syncAllEventsForUser } from '@/lib/google-calendar/sync-service';

export async function POST() {
  try {
    const user = await getApiAuthUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await syncAllEventsForUser(user.id);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Sync failed', debug: result.debug },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, debug: result.debug });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync calendar' },
      { status: 500 }
    );
  }
}
