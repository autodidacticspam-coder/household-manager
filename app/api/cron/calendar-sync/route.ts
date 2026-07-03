import { NextRequest, NextResponse } from 'next/server';
import { getApiAdminClient } from '@/lib/supabase/api-helpers';
import { syncAllEventsForUser } from '@/lib/google-calendar/sync-service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const cronSecret = process.env.CRON_SECRET;

/**
 * Hourly reconciliation of every connected Google Calendar. Keeps calendars
 * in sync even if nobody presses the manual sync button, and repairs any
 * events that individual change-triggered syncs missed.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getApiAdminClient();
    const { data: tokens } = await supabase
      .from('google_calendar_tokens')
      .select('user_id');

    const results: Array<{ userId: string; success: boolean; error?: string; counts?: unknown }> = [];

    for (const token of tokens || []) {
      const result = await syncAllEventsForUser(token.user_id);
      results.push({
        userId: token.user_id,
        success: result.success,
        error: result.error,
        counts: result.debug && {
          desired: result.debug.desiredCount,
          existing: result.debug.existingCount,
          created: result.debug.created,
          updated: result.debug.updated,
          deleted: result.debug.deleted,
          unchanged: result.debug.unchanged,
          failed: result.debug.failed,
        },
      });
    }

    return NextResponse.json({ success: true, synced: results.length, results });
  } catch (error) {
    console.error('Calendar sync cron error:', error);
    return NextResponse.json(
      { error: 'Calendar sync cron failed' },
      { status: 500 }
    );
  }
}
