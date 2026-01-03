'use client';

import { usePushNotifications } from '@/hooks/use-push-notifications';
import { Button } from '@/components/ui/button';
import { Bell, BellOff, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslations } from 'next-intl';

export function PushNotificationPrompt() {
  const { status, isLoading, isSupported, requestPermission, token, manualRegister } = usePushNotifications();
  const t = useTranslations();

  // Always show debug info in Capacitor
  if (isSupported) {
    return (
      <Card className="border-orange-200 bg-orange-50 mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Push Debug</CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-1">
          <p>Status: {status}</p>
          <p>Loading: {isLoading ? 'yes' : 'no'}</p>
          <p>Token: {token ? token.slice(0, 20) + '...' : 'none'}</p>
          {status === 'prompt' && (
            <Button onClick={requestPermission} variant="default" size="sm" className="mt-2">
              Enable Notifications
            </Button>
          )}
          <Button onClick={manualRegister} variant="outline" size="sm" className="mt-2 ml-2">
            Force Register
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
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
