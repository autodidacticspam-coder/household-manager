'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';

// Check if we're running in Capacitor
const isCapacitor = typeof window !== 'undefined' && 'Capacitor' in window;

// Event for notification popup
type NotificationData = {
  taskId: string;
  title: string;
  description?: string;
  priority: string;
  dueDate?: string;
  dueTime?: string;
  type: string;
};

// Global event emitter for notification popups
const notificationListeners: ((data: NotificationData) => void)[] = [];

export function onNotificationTap(callback: (data: NotificationData) => void) {
  notificationListeners.push(callback);
  return () => {
    const index = notificationListeners.indexOf(callback);
    if (index > -1) notificationListeners.splice(index, 1);
  };
}

function emitNotificationTap(data: NotificationData) {
  notificationListeners.forEach(listener => listener(data));
}

type PushNotificationStatus = 'prompt' | 'granted' | 'denied' | 'unsupported';

export function usePushNotifications() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushNotificationStatus>('unsupported');
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const tokenSavedRef = useRef(false);
  const pendingTokenRef = useRef<string | null>(null);

  // Save token when user becomes available
  useEffect(() => {
    if (user && pendingTokenRef.current && !tokenSavedRef.current) {
      console.log('[PUSH_HOOK] User now available, saving pending token');
      saveTokenToDatabase(pendingTokenRef.current);
    }
  }, [user]);

  useEffect(() => {
    if (!isCapacitor) {
      setStatus('unsupported');
      setIsLoading(false);
      return;
    }

    const initPushNotifications = async () => {
      try {
        // Dynamically import Capacitor plugins only when in Capacitor environment
        const { PushNotifications } = await import('@capacitor/push-notifications');

        // Check current permission status
        const permStatus = await PushNotifications.checkPermissions();
        console.log('[PUSH_HOOK] Permission status:', permStatus.receive);

        if (permStatus.receive === 'prompt') {
          setStatus('prompt');
        } else if (permStatus.receive === 'granted') {
          setStatus('granted');
          await registerForPush();
        } else {
          setStatus('denied');
        }
      } catch (error) {
        console.error('[PUSH_HOOK] Error initializing push notifications:', error);
        setStatus('unsupported');
      } finally {
        setIsLoading(false);
      }
    };

    const registerForPush = async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        // Set up listeners BEFORE calling register
        PushNotifications.addListener('registration', async (pushToken) => {
          console.log('[PUSH_HOOK] Registration success, token:', pushToken.value.slice(0, 20) + '...');
          setToken(pushToken.value);
          pendingTokenRef.current = pushToken.value;

          // Save token to database for the current user
          if (user) {
            console.log('[PUSH_HOOK] Saving token for user:', user.id);
            await saveTokenToDatabase(pushToken.value);
          } else {
            console.log('[PUSH_HOOK] No user yet, token saved to pending');
          }
        });

        // Listen for registration errors
        PushNotifications.addListener('registrationError', (error) => {
          console.error('[PUSH_HOOK] Registration error:', error);
        });

        // Listen for incoming notifications when app is open
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('[PUSH_HOOK] Notification received:', notification);
        });

        // Listen for notification tap/action
        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
          console.log('[PUSH_HOOK] Notification action performed:', notification);
          const data = notification.notification.data;
          if (data?.taskId) {
            // Emit event to show popup with task details
            emitNotificationTap({
              taskId: data.taskId,
              title: data.title || '',
              description: data.description || '',
              priority: data.priority || 'medium',
              dueDate: data.dueDate || '',
              dueTime: data.dueTime || '',
              type: data.type || 'task_assigned',
            });
          }
        });

        // Now call register AFTER listeners are set up
        console.log('[PUSH_HOOK] Calling PushNotifications.register()...');
        await PushNotifications.register();
        console.log('[PUSH_HOOK] Register called successfully');
      } catch (error) {
        console.error('[PUSH_HOOK] Error registering for push:', error);
      }
    };

    initPushNotifications();

    // Cleanup listeners on unmount
    return () => {
      if (isCapacitor) {
        import('@capacitor/push-notifications').then(({ PushNotifications }) => {
          PushNotifications.removeAllListeners();
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const saveTokenToDatabase = async (pushToken: string) => {
    if (tokenSavedRef.current) {
      console.log('[PUSH_HOOK] saveTokenToDatabase: Token already saved, skipping');
      return;
    }

    console.log('[PUSH_HOOK] saveTokenToDatabase: Saving token via API...');

    try {
      const response = await fetch('/api/push-tokens/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: pushToken, platform: 'ios' }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('[PUSH_HOOK] API error:', data.error);
        return;
      }

      console.log('[PUSH_HOOK] Token saved successfully via API!');
      tokenSavedRef.current = true;
    } catch (error) {
      console.error('[PUSH_HOOK] Error saving push token:', error);
    }
  };

  const requestPermission = async () => {
    if (!isCapacitor) return false;

    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');

      const permStatus = await PushNotifications.requestPermissions();

      if (permStatus.receive === 'granted') {
        setStatus('granted');

        // Set up listener for registration before calling register
        PushNotifications.addListener('registration', async (pushToken) => {
          console.log('Push registration success, token:', pushToken.value);
          setToken(pushToken.value);

          // Save token to database for the current user
          if (user) {
            await saveTokenToDatabase(pushToken.value);
          }
        });

        PushNotifications.addListener('registrationError', (error) => {
          console.error('Push registration error:', error);
        });

        // Listen for notification tap/action
        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
          console.log('Push notification action performed:', notification);
          const data = notification.notification.data;
          if (data?.taskId) {
            window.location.href = `/tasks/${data.taskId}`;
          }
        });

        await PushNotifications.register();
        return true;
      } else {
        setStatus('denied');
        return false;
      }
    } catch (error) {
      console.error('Error requesting push permission:', error);
      return false;
    }
  };

  const manualRegister = async () => {
    if (!isCapacitor) return;

    try {
      console.log('[PUSH_HOOK] Manual register triggered');
      const { PushNotifications } = await import('@capacitor/push-notifications');

      // Remove old listeners first
      await PushNotifications.removeAllListeners();

      // Set up fresh listener
      PushNotifications.addListener('registration', async (pushToken) => {
        console.log('[PUSH_HOOK] Manual registration success, token:', pushToken.value.slice(0, 20) + '...');
        setToken(pushToken.value);
        pendingTokenRef.current = pushToken.value;
        tokenSavedRef.current = false; // Reset so it saves again
        await saveTokenToDatabase(pushToken.value);
      });

      PushNotifications.addListener('registrationError', (error) => {
        console.error('[PUSH_HOOK] Manual registration error:', error);
        alert('Registration error: ' + JSON.stringify(error));
      });

      console.log('[PUSH_HOOK] Calling register...');
      await PushNotifications.register();
      console.log('[PUSH_HOOK] Register called');
    } catch (error) {
      console.error('[PUSH_HOOK] Manual register error:', error);
      alert('Error: ' + String(error));
    }
  };

  return {
    status,
    token,
    isLoading,
    isSupported: isCapacitor,
    requestPermission,
    manualRegister,
  };
}
