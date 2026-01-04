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
  notification: PushNotification
): Promise<{ sent: number; failed: number; errors: string[] }> {
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
    console.error('[PUSH] APNS not configured');
    return { sent: 0, failed: 0, errors: ['APNS not configured'] };
  }

  const tokens = await getUserPushTokens(userIds);

  if (tokens.length === 0) {
    return { sent: 0, failed: 0, errors: ['No tokens found'] };
  }

  const results = await Promise.all(
    tokens.map((t) => sendPushToDevice(t.token, notification))
  );

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

// Send task assignment push notification
export async function sendTaskAssignedPush(
  userIds: string[],
  taskTitle: string,
  taskId: string,
  priority: string,
  description?: string | null,
  dueDate?: string | null,
  dueTime?: string | null
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const priorityLabels: Record<string, string> = {
    low: 'Low Priority',
    medium: 'Medium Priority',
    high: 'High Priority',
    urgent: 'URGENT',
  };

  const priorityEmoji: Record<string, string> = {
    low: '📋',
    medium: '📌',
    high: '⚠️',
    urgent: '🚨',
  };

  const emoji = priorityEmoji[priority] || '📋';
  const label = priorityLabels[priority] || priority;

  let body = `[${label}] ${taskTitle}`;
  if (description) {
    const truncatedDesc = description.length > 100
      ? description.slice(0, 100) + '...'
      : description;
    body += `\n${truncatedDesc}`;
  }

  return sendPushToUsers(userIds, {
    title: `${emoji} New Task Assigned`,
    body,
    data: {
      taskId,
      type: 'task_assigned',
      title: taskTitle,
      description: description || '',
      priority,
      dueDate: dueDate || '',
      dueTime: dueTime || '',
    },
  });
}

// Send task reminder push notification
export async function sendTaskReminderPush(
  userIds: string[],
  taskTitle: string,
  taskId: string,
  priority: string,
  description?: string | null,
  dueDate?: string | null,
  dueTime?: string | null
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const priorityLabels: Record<string, string> = {
    low: 'Low Priority',
    medium: 'Medium Priority',
    high: 'High Priority',
    urgent: 'URGENT',
  };

  const label = priorityLabels[priority] || priority;

  let formattedTime = '';
  if (dueTime) {
    const [hours, minutes] = dueTime.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    formattedTime = `${hour12}:${minutes} ${ampm}`;
  }

  let body = `⚠️ Only 15 minutes left!\n[${label}] ${taskTitle}`;
  if (formattedTime) {
    body += ` - Due at ${formattedTime}`;
  }
  if (description) {
    const truncatedDesc = description.length > 60
      ? description.slice(0, 60) + '...'
      : description;
    body += `\n${truncatedDesc}`;
  }

  return sendPushToUsers(userIds, {
    title: '⏰ 15 Minutes Left!',
    body,
    data: {
      taskId,
      type: 'task_reminder',
      title: taskTitle,
      description: description || '',
      priority,
      dueDate: dueDate || '',
      dueTime: dueTime || '',
    },
  });
}

// Send task completed notification (to admins)
export async function sendTaskCompletedPush(
  adminUserIds: string[],
  taskTitle: string,
  taskId: string,
  completedBy: string
): Promise<void> {
  await sendPushToUsers(adminUserIds, {
    title: '✅ Task Completed',
    body: `"${taskTitle}" was completed by ${completedBy}`,
    data: {
      taskId,
      type: 'task_completed',
    },
  });
}
