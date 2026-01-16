import { NextResponse } from 'next/server';
import { getApiAuthUser } from '@/lib/supabase/api-helpers';
import { syncAllEventsForUser } from '@/lib/google-calendar/sync-service';

// Disable caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

    const response = NextResponse.json({
      success: true,
      routeVersion: 'v5',
      timestamp: new Date().toISOString(),
      debug: result.debug
    });
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return response;
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync calendar' },
      { status: 500 }
    );
  }
}
