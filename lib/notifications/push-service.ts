import { createClient } from '@supabase/supabase-js';
import https from 'https';
import * as jose from 'jose';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// APNS Configuration - set these in your environment variables
const APNS_KEY_ID = process.env.APNS_KEY_ID!;
const APNS_TEAM_ID = process.env.APNS_TEAM_ID!;
const APNS_PRIVATE_KEY = process.env.APNS_PRIVATE_KEY!; // The .p8 file contents
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

// Cache for APNS token (valid for 1 hour, we refresh every 50 minutes)
let cachedToken: { token: string; expiresAt: number } | null = null;

// Generate JWT for APNS authentication
async function generateAPNSToken(): Promise<string> {
  // Return cached token if still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  // The private key needs newlines restored if stored as single line
  const privateKeyPem = APNS_PRIVATE_KEY.replace(/\\n/g, '\n');
  const privateKey = await jose.importPKCS8(privateKeyPem, 'ES256');

  const token = await new jose.SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: APNS_KEY_ID })
    .setIssuer(APNS_TEAM_ID)
    .setIssuedAt()
    .sign(privateKey);

  // Cache for 50 minutes (APNS tokens are valid for 1 hour)
  cachedToken = {
    token,
    expiresAt: Date.now() + 50 * 60 * 1000,
  };

  return token;
}

// Send push notification to a single device
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

  const token = await generateAPNSToken();

  return new Promise((resolve) => {
    const options = {
      hostname: host,
      port: 443,
      path: `/3/device/${deviceToken}`,
      method: 'POST',
      headers: {
        'authorization': `bearer ${token}`,
        'apns-topic': APNS_BUNDLE_ID,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve({ success: true, token: deviceToken });
        } else {
          let errorMessage = `HTTP ${res.statusCode}`;
          try {
            const errorData = JSON.parse(data);
            errorMessage = errorData.reason || errorMessage;
          } catch {
            // ignore parse errors
          }
          resolve({ success: false, token: deviceToken, error: errorMessage });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ success: false, token: deviceToken, error: error.message });
    });

    req.write(JSON.stringify(apnsPayload));
    req.end();
  });
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
    console.error('Error fetching push tokens:', error);
    return [];
  }

  return tokens || [];
}

// Send push notification to multiple users
export async function sendPushToUsers(
  userIds: string[],
  notification: PushNotification
): Promise<{ sent: number; failed: number; errors: string[] }> {
  // Check if APNS is configured
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
    console.warn('APNS not configured - skipping push notifications');
    return { sent: 0, failed: 0, errors: ['APNS not configured'] };
  }

  const tokens = await getUserPushTokens(userIds);

  if (tokens.length === 0) {
    return { sent: 0, failed: 0, errors: [] };
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
  priority: string
): Promise<void> {
  const priorityEmoji = {
    low: '📋',
    medium: '📌',
    high: '⚠️',
    urgent: '🚨',
  }[priority] || '📋';

  await sendPushToUsers(userIds, {
    title: `${priorityEmoji} New Task Assigned`,
    body: taskTitle,
    data: {
      taskId,
      type: 'task_assigned',
    },
  });
}

// Send task reminder push notification
export async function sendTaskReminderPush(
  userIds: string[],
  taskTitle: string,
  taskId: string,
  dueTime?: string
): Promise<void> {
  const body = dueTime
    ? `"${taskTitle}" is due at ${dueTime}`
    : `"${taskTitle}" is due soon`;

  await sendPushToUsers(userIds, {
    title: '⏰ Task Reminder',
    body,
    data: {
      taskId,
      type: 'task_reminder',
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
