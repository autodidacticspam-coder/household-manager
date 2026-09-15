import { after } from 'next/server';
import { getAdminClient } from '@/lib/supabase/server';
import { databaseClient } from '@/lib/supabase/database-client';
import { sendPushToUsers } from './push-service';
import { localizedPushMessage } from './messages';

export async function dispatchMenuPushes(actorId?: string) {
  const db = databaseClient(getAdminClient());
  const { data, error } = await db.rpc('claim_menu_notification_pushes', actorId ? { p_actor: actorId } : {});
  if (error) throw new Error('Menu notification queue unavailable');
  await Promise.all((data || []).map(async notification => {
    let state: 'pending' | 'sent' | 'unavailable' | 'failed' = notification.push_attempts >= 3 ? 'failed' : 'pending';
    try {
      const result = await sendPushToUsers([notification.recipient_id], locale => ({
        ...localizedPushMessage(locale, notification.kind as 'menu_updated' | 'swap_requested' | 'swap_accepted' | 'swap_rejected' | 'swap_stale' | 'swap_cancelled', { date: notification.week_start }),
        data: { type: notification.kind, weekStart: notification.week_start, notificationId: notification.id, requestId: notification.request_id || '' },
      }));
      // The saved in-app notification remains available without a registered device.
      if (result.errors.includes('No tokens found')) state = 'unavailable';
      else if (result.sent > 0 && result.failed === 0) state = 'sent';
    } catch {
      // Retry from the durable outbox. Never turn a committed menu save into an error.
    }
    const { error: updateError } = await db.from('menu_notifications').update({ push_state: state })
      .eq('id', notification.id).eq('push_attempts', notification.push_attempts);
    if (updateError) throw new Error('Menu notification delivery status unavailable');
  }));
  return data?.length || 0;
}

export function scheduleMenuPushes(actorId: string) {
  // The minute cron also drains this queue if a request ends before delivery.
  try {
    after(async () => {
      try { await dispatchMenuPushes(actorId); }
      catch { console.error('Menu push delivery deferred to the retry queue.'); }
    });
  } catch {
    console.error('Menu push delivery deferred to the retry queue.');
  }
}
