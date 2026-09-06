import { localizedPushMessage } from './messages';
import { createClient } from '@supabase/supabase-js';
import http2 from 'http2';
import * as jose from 'jose';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// APNS Configuration
const APNS_KEY_ID = process.env.APNS_KEY_ID?.trim() || '';
const APNS_TEAM_ID = process.env.APNS_TEAM_ID?.trim() || '';
const APNS_PRIVATE_KEY = process.env.APNS_PRIVATE_KEY?.trim() || '';
const APNS_BUNDLE_ID = 'com.household.manager';
const APNS_PRODUCTION = process.env.NODE_ENV === 'production';

type PushNotification = {
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: number;
  sound?: string;
};

type PushResult = {
  success: boolean;
  token: string;
  error?: string;
};

// Cache for APNS JWT token (valid for 1 hour, we refresh every 50 minutes)
let cachedToken: { token: string; expiresAt: number } | null = null;

// Generate JWT for APNS authentication
async function generateAPNSToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  let privateKeyPem = APNS_PRIVATE_KEY;
  if (privateKeyPem.includes('\\n')) {
    privateKeyPem = privateKeyPem.replace(/\\n/g, '\n');
  }

  const privateKey = await jose.importPKCS8(privateKeyPem, 'ES256');
  const token = await new jose.SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: APNS_KEY_ID })
    .setIssuer(APNS_TEAM_ID)
    .setIssuedAt()
    .sign(privateKey);

  cachedToken = {
    token,
    expiresAt: Date.now() + 50 * 60 * 1000,
  };

  return token;
}

// Send push notification to a single device using HTTP/2
async function sendPushToDevice(
  deviceToken: string,
  notification: PushNotification
): Promise<PushResult> {
  const host = APNS_PRODUCTION
    ? 'api.push.apple.com'
    : 'api.sandbox.push.apple.com';

  const apnsPayload = {
    aps: {
      alert: {
        title: notification.title,
        body: notification.body,
      },
      badge: notification.badge ?? 1,
      sound: notification.sound ?? 'default',
      'mutable-content': 1,
    },
    ...notification.data,
  };

  try {
    const jwtToken = await generateAPNSToken();

    return new Promise((resolve) => {
      const client = http2.connect(`https://${host}`);

      client.on('error', (err) => {
        console.error('[PUSH] HTTP/2 error:', err.message);
        client.close();
        resolve({ success: false, token: deviceToken, error: err.message });
      });

      const headers = {
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        'authorization': `bearer ${jwtToken}`,
        'apns-topic': APNS_BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      };

      const req = client.request(headers);

      let responseData = '';
      let statusCode: number | undefined;

      req.on('response', (headers) => {
        statusCode = headers[':status'] as number;
      });

      req.on('data', (chunk) => {
        responseData += chunk;
      });

      req.on('end', () => {
        client.close();

        if (statusCode === 200) {
          resolve({ success: true, token: deviceToken });
        } else {
          let errorMessage = `HTTP ${statusCode}`;
          try {
            const errorData = JSON.parse(responseData);
            errorMessage = errorData.reason || errorMessage;
          } catch {
            // Use raw error if JSON parsing fails
          }
          console.error('[PUSH] APNS error:', errorMessage);
          resolve({ success: false, token: deviceToken, error: errorMessage });
        }
      });

      req.on('error', (err) => {
        console.error('[PUSH] Request error:', err.message);
        client.close();
        resolve({ success: false, token: deviceToken, error: err.message });
      });

      req.write(JSON.stringify(apnsPayload));
      req.end();
    });
  } catch (err) {
    console.error('[PUSH] Error sending to device:', err);
    return { success: false, token: deviceToken, error: String(err) };
  }
}

// Get push tokens for specific users
export async function getUserPushTokens(userIds: string[]): Promise<{ userId: string; token: string }[]> {
  if (userIds.length === 0) return [];

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: tokens, error } = await supabase
    .from('user_push_tokens')
    .select('user_id, token')
    .in('user_id', userIds)
    .eq('platform', 'ios');

  if (error) {
    console.error('[PUSH] Error fetching tokens:', error);
    return [];
  }

  return (tokens || []).map(t => ({ userId: t.user_id, token: t.token }));
}

// Send push notification to multiple users
export async function sendPushToUsers(
  userIds: string[],
  notification: PushNotification | ((locale: string) => PushNotification)
): Promise<{ sent: number; failed: number; errors: string[] }> {
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
    console.error('[PUSH] APNS not configured');
    return { sent: 0, failed: 0, errors: ['APNS not configured'] };
  }

  const tokens = await getUserPushTokens(userIds);

  if (tokens.length === 0) {
    return { sent: 0, failed: 0, errors: ['No tokens found'] };
  }

  const { data: users } = await createClient(supabaseUrl, supabaseServiceKey).from('users').select('id, preferred_locale').in('id', [...new Set(userIds)]);
  const locales = new Map((users || []).map(user => [user.id, user.preferred_locale || 'en']));
  const results = await Promise.all(tokens.map(token => sendPushToDevice(token.token,
    typeof notification === 'function' ? notification(locales.get(token.userId) || 'en') : notification
  )));

  const sent = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const errors = results
    .filter((r) => !r.success && r.error)
    .map((r) => `${r.token.slice(0, 8)}...: ${r.error}`);

  // Remove invalid tokens from database
  const invalidTokens = results
    .filter((r) => r.error === 'BadDeviceToken' || r.error === 'Unregistered')
    .map((r) => r.token);

  if (invalidTokens.length > 0) {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    await supabase
      .from('user_push_tokens')
      .delete()
      .in('token', invalidTokens);
  }

  return { sent, failed, errors };
}

function optionalLine(value?: string | null, max = 100) { return value ? '\n' + (value.length > max ? value.slice(0, max) + '…' : value) : ''; }

export async function sendTaskAssignedPush(userIds: string[], taskTitle: string, taskId: string, priority: string, description?: string | null, dueDate?: string | null, dueTime?: string | null) {
  return sendPushToUsers(userIds, locale => ({ ...localizedPushMessage(locale, 'assigned', { priority, title: taskTitle, description: optionalLine(description) }),
    data: { taskId, type: 'task_assigned', title: taskTitle, description: description || '', priority, dueDate: dueDate || '', dueTime: dueTime || '' } }));
}

export async function sendTaskReminderPush(userIds: string[], taskTitle: string, taskId: string, priority: string, description?: string | null, dueDate?: string | null, dueTime?: string | null) {
  return sendPushToUsers(userIds, locale => {
    const time = dueTime ? new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' }).format(new Date('2000-01-01T' + dueTime.slice(0,5) + ':00Z')) : '';
    return { ...localizedPushMessage(locale, 'reminder', { priority, title: taskTitle, time, description: optionalLine(description, 60) }),
      data: { taskId, type: 'task_reminder', title: taskTitle, description: description || '', priority, dueDate: dueDate || '', dueTime: dueTime || '' } };
  });
}

export async function sendTaskCompletedPush(adminUserIds: string[], taskTitle: string, taskId: string, completedBy: string): Promise<void> {
  await sendPushToUsers(adminUserIds, locale => ({ ...localizedPushMessage(locale, 'completed', { title: taskTitle, name: completedBy }), data: { taskId, type: 'task_completed' } }));
}

export async function sendBookingRequestPush(userIds: string[], date: string, time: string, note?: string | null) {
  return sendPushToUsers(userIds, locale => ({ ...localizedPushMessage(locale, 'booking', { date, time, note: optionalLine(note) }), data: { type: 'booking_request' } }));
}

export async function sendBookingResponsePush(adminUserIds: string[], sitterName: string, accepted: boolean, date: string, time: string): Promise<void> {
  await sendPushToUsers(adminUserIds, locale => ({ ...localizedPushMessage(locale, accepted ? 'accepted' : 'declined', { name: sitterName, date, time }), data: { type: 'booking_response' } }));
}

export async function sendBookingCancellationPush(userIds: string[], date: string, time: string, removedAcceptedShift: boolean) {
  return sendPushToUsers(userIds, locale => ({ ...localizedPushMessage(locale, removedAcceptedShift ? 'shiftCancelled' : 'requestCancelled', { date, time }), data: { type: 'booking_cancelled' } }));
}

export async function sendTaskExpirationPush(userIds: string[], taskTitle: string, taskId: string, lastDueDate: string, taskCount: number) {
  return sendPushToUsers(userIds, locale => ({ ...localizedPushMessage(locale, 'expiring', { title: taskTitle, date: lastDueDate, count: taskCount }), data: { taskId, type: 'task_expiring', title: taskTitle, lastDueDate } }));
}
