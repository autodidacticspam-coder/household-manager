'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';

// Check if we're running in Capacitor
const isCapacitor = typeof window !== 'undefined' && 'Capacitor' in window;

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
            window.location.href = `/tasks/${data.taskId}`;
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
  }, [user]);

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

  return {
    status,
    token,
    isLoading,
    isSupported: isCapacitor,
    requestPermission,
  };
}
