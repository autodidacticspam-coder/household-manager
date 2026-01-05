'use client';

import { useEffect, useState, useRef } from 'react';
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
        const { PushNotifications } = await import('@capacitor/push-notifications');
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

        PushNotifications.addListener('registration', async (pushToken) => {
          setToken(pushToken.value);
          pendingTokenRef.current = pushToken.value;

          if (user) {
            await saveTokenToDatabase(pushToken.value);
          }
        });

        PushNotifications.addListener('registrationError', (error) => {
          console.error('Push registration error:', error);
        });

        PushNotifications.addListener('pushNotificationReceived', () => {
          // Notification received while app is open - can show in-app UI if needed
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
          const data = notification.notification.data;
          if (data?.taskId) {
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

        await PushNotifications.register();
      } catch (error) {
        console.error('Error registering for push:', error);
      }
    };

    initPushNotifications();

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
    if (tokenSavedRef.current) return;

    try {
      const response = await fetch('/api/push-tokens/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: pushToken, platform: 'ios' }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Error saving push token:', data.error);
        return;
      }

      tokenSavedRef.current = true;
    } catch (error) {
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

        PushNotifications.addListener('registration', async (pushToken) => {
          setToken(pushToken.value);
          if (user) {
            await saveTokenToDatabase(pushToken.value);
          }
        });

        PushNotifications.addListener('registrationError', (error) => {
          console.error('Push registration error:', error);
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
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
      const { PushNotifications } = await import('@capacitor/push-notifications');
      await PushNotifications.removeAllListeners();

      PushNotifications.addListener('registration', async (pushToken) => {
        setToken(pushToken.value);
        pendingTokenRef.current = pushToken.value;
        tokenSavedRef.current = false;
        await saveTokenToDatabase(pushToken.value);
      });

      PushNotifications.addListener('registrationError', (error) => {
        console.error('Push registration error:', error);
      });

      await PushNotifications.register();
    } catch (error) {
      console.error('Manual push register error:', error);
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
