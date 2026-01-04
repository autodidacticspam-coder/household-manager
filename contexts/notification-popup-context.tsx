'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { formatTime12h } from '@/lib/format-time';
import { onNotificationTap } from '@/hooks/use-push-notifications';

type NotificationData = {
  taskId: string;
  title: string;
  description?: string;
  priority: string;
  dueDate?: string;
  dueTime?: string;
  type: string;
};

type NotificationPopupContextType = {
  showNotification: (data: NotificationData) => void;
};

const NotificationPopupContext = createContext<NotificationPopupContextType | null>(null);

export function useNotificationPopup() {
  const context = useContext(NotificationPopupContext);
  if (!context) {
    throw new Error('useNotificationPopup must be used within NotificationPopupProvider');
  }
  return context;
}

const priorityColors: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

const priorityLabels: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export function NotificationPopupProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notification, setNotification] = useState<NotificationData | null>(null);
  const router = useRouter();

  const showNotification = useCallback((data: NotificationData) => {
    setNotification(data);
    setIsOpen(true);
  }, []);

  // Listen for notification taps from push notifications
  useEffect(() => {
    const unsubscribe = onNotificationTap((data) => {
      showNotification(data);
    });
    return unsubscribe;
  }, [showNotification]);

  const handleViewTask = () => {
    if (notification?.taskId) {
      setIsOpen(false);
      router.push(`/tasks/${notification.taskId}/edit`);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <NotificationPopupContext.Provider value={{ showNotification }}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 mb-2">
              {notification?.priority && (
                <Badge className={priorityColors[notification.priority] || priorityColors.low}>
                  {priorityLabels[notification.priority] || notification.priority}
                </Badge>
              )}
            </div>
            <DialogTitle className="text-lg">{notification?.title}</DialogTitle>
            {notification?.description && (
              <DialogDescription className="text-sm mt-2 whitespace-pre-wrap">
                {notification.description}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-3 mt-4">
            {(notification?.dueDate || notification?.dueTime) && (
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {notification.dueDate && (
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    <span>{formatDate(notification.dueDate)}</span>
                  </div>
                )}
                {notification.dueTime && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    <span>{formatTime12h(notification.dueTime)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1">
                Dismiss
              </Button>
              <Button onClick={handleViewTask} className="flex-1">
                View Task
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </NotificationPopupContext.Provider>
  );
}
