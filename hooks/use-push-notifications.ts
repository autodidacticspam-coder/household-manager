'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';

// Check if we're running in Capacitor
const isCapacitor = typeof window !== 'undefined' && 'Capacitor' in window;

type PushNotificationStatus = 'prompt' | 'granted' | 'denied' | 'unsupported';

export function usePushNotifications() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushNotificationStatus>('unsupported');
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

        if (permStatus.receive === 'prompt') {
          setStatus('prompt');
        } else if (permStatus.receive === 'granted') {
          setStatus('granted');
          await registerForPush();
        } else {
          setStatus('denied');
        }
      } catch (error) {
        console.error('Error initializing push notifications:', error);
        setStatus('unsupported');
      } finally {
        setIsLoading(false);
      }
    };

    const registerForPush = async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        // Register with Apple/Google to get push token
        await PushNotifications.register();

        // Listen for registration success
        PushNotifications.addListener('registration', async (pushToken) => {
          console.log('Push registration success, token:', pushToken.value);
          setToken(pushToken.value);

          // Save token to database for the current user
          if (user) {
            await saveTokenToDatabase(pushToken.value);
          }
        });

        // Listen for registration errors
        PushNotifications.addListener('registrationError', (error) => {
          console.error('Push registration error:', error);
        });

        // Listen for incoming notifications when app is open
        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('Push notification received:', notification);
          // You can show an in-app notification here
        });

        // Listen for notification tap/action
        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
          console.log('Push notification action performed:', notification);
          // Navigate to relevant screen based on notification data
          const data = notification.notification.data;
          if (data?.taskId) {
            window.location.href = `/tasks/${data.taskId}`;
          }
        });
      } catch (error) {
        console.error('Error registering for push:', error);
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
    if (!user) return;

    const supabase = createClient();

    // Upsert the push token for this user
    const { error } = await supabase
      .from('user_push_tokens')
      .upsert({
        user_id: user.id,
        token: pushToken,
        platform: 'ios',
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,token',
      });

    if (error) {
      console.error('Error saving push token:', error);
    }
  };

  const requestPermission = async () => {
    if (!isCapacitor) return false;

    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');

      const permStatus = await PushNotifications.requestPermissions();

      if (permStatus.receive === 'granted') {
        setStatus('granted');
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
