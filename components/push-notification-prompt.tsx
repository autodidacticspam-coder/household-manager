'use client';

import { usePushNotifications } from '@/hooks/use-push-notifications';
import { Button } from '@/components/ui/button';
import { Bell, BellOff, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslations } from 'next-intl';

export function PushNotificationPrompt() {
  const { status, isLoading, isSupported, requestPermission } = usePushNotifications();
  const t = useTranslations();

  // Debug logging
  console.log('[PUSH_PROMPT] status:', status, 'isLoading:', isLoading, 'isSupported:', isSupported);

  // Don't show anything if not in Capacitor or still loading
  if (!isSupported || isLoading) {
    return null;
  }

  // Don't show if already granted
  if (status === 'granted') {
    return null;
  }

  // Don't show if denied (user made their choice)
  if (status === 'denied') {
    return null;
  }

  // Show prompt for users who haven't decided yet
  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="h-5 w-5 text-blue-600" />
          {t('notifications.enableTitle')}
        </CardTitle>
        <CardDescription>
          {t('notifications.enableDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={requestPermission} variant="default" size="sm">
          {t('notifications.enableButton')}
        </Button>
      </CardContent>
    </Card>
  );
}

// Smaller inline version for settings page
export function PushNotificationStatus() {
  const { status, isLoading, isSupported, requestPermission } = usePushNotifications();
  const t = useTranslations();

  if (!isSupported) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <BellOff className="h-4 w-4" />
        <span className="text-sm">{t('notifications.notSupported')}</span>
      </div>
    );
  }

  if (isLoading) {
    return <span className="text-sm text-muted-foreground">{t('common.loading')}</span>;
  }

  if (status === 'granted') {
    return (
      <div className="flex items-center gap-2 text-green-600">
        <Check className="h-4 w-4" />
        <span className="text-sm">{t('notifications.enabled')}</span>
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <BellOff className="h-4 w-4" />
        <span className="text-sm">{t('notifications.denied')}</span>
      </div>
    );
  }

  return (
    <Button onClick={requestPermission} variant="outline" size="sm">
      <Bell className="h-4 w-4 mr-2" />
      {t('notifications.enableButton')}
    </Button>
  );
}
