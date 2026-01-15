'use client';

import { useState, Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUser } from '@/hooks/use-user';
import { Skeleton } from '@/components/ui/skeleton';
import { GoogleCalendarSettings } from '@/components/google-calendar-settings';

export default function SettingsPage() {
  const t = useTranslations();
  const { user, isLoading, updateUser, isUpdating } = useUser();

  // Log redirect preference - use lazy initialization
  const [redirectAfterLog, setRedirectAfterLog] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('logs-redirect-after-entry') === 'true';
  });

  // Time prepopulate preferences (default to true) - use lazy initialization
  const [prepopulateSleepTime, setPrepopulateSleepTime] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('logs-prepopulate-sleep-time');
    return stored === null ? true : stored === 'true';
  });
  const [prepopulateFoodTime, setPrepopulateFoodTime] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('logs-prepopulate-food-time');
    return stored === null ? true : stored === 'true';
  });
  const [prepopulatePoopTime, setPrepopulatePoopTime] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('logs-prepopulate-poop-time');
    return stored === null ? true : stored === 'true';
  });
  const [prepopulateShowerTime, setPrepopulateShowerTime] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('logs-prepopulate-shower-time');
    return stored === null ? true : stored === 'true';
  });

  const handleRedirectToggle = (checked: boolean) => {
    setRedirectAfterLog(checked);
    localStorage.setItem('logs-redirect-after-entry', String(checked));
  };

  const handlePrepopulateToggle = (category: 'sleep' | 'food' | 'poop' | 'shower', checked: boolean) => {
    localStorage.setItem(`logs-prepopulate-${category}-time`, String(checked));
    switch (category) {
      case 'sleep': setPrepopulateSleepTime(checked); break;
      case 'food': setPrepopulateFoodTime(checked); break;
      case 'poop': setPrepopulatePoopTime(checked); break;
      case 'shower': setPrepopulateShowerTime(checked); break;
    }
  };

  const handleLocaleChange = async (locale: 'en' | 'es' | 'zh') => {
    // First, set the locale cookie via API
    await fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    });

    // Update user preference in database
    await updateUser({ preferredLocale: locale });

    // Reload the page to apply the new locale
    window.location.reload();
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96 mt-2" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-48" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>
        <p className="text-muted-foreground">
          {t('settings.description')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.language')}</CardTitle>
          <CardDescription>
            {t('settings.languageDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="language">{t('settings.language')}</Label>
            <Select
              value={user?.preferredLocale || 'en'}
              onValueChange={(value) => handleLocaleChange(value as 'en' | 'es' | 'zh')}
              disabled={isUpdating}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="zh">中文</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Suspense fallback={
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-48" />
          </CardContent>
        </Card>
      }>
        <GoogleCalendarSettings />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.childLogs')}</CardTitle>
          <CardDescription>
            {t('settings.childLogsDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="redirect-after-log">{t('settings.redirectAfterLog')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('settings.redirectAfterLogDescription')}
              </p>
            </div>
            <Switch
              id="redirect-after-log"
              checked={redirectAfterLog}
              onCheckedChange={handleRedirectToggle}
            />
          </div>

          <div className="border-t pt-6">
            <h4 className="text-sm font-medium mb-4">{t('settings.prepopulateTime')}</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="prepopulate-sleep">{t('settings.prepopulateSleep')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.prepopulateSleepDescription')}
                  </p>
                </div>
                <Switch
                  id="prepopulate-sleep"
                  checked={prepopulateSleepTime}
                  onCheckedChange={(checked) => handlePrepopulateToggle('sleep', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="prepopulate-food">{t('settings.prepopulateFood')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.prepopulateFoodDescription')}
                  </p>
                </div>
                <Switch
                  id="prepopulate-food"
                  checked={prepopulateFoodTime}
                  onCheckedChange={(checked) => handlePrepopulateToggle('food', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="prepopulate-poop">{t('settings.prepopulatePoop')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.prepopulatePoopDescription')}
                  </p>
                </div>
                <Switch
                  id="prepopulate-poop"
                  checked={prepopulatePoopTime}
                  onCheckedChange={(checked) => handlePrepopulateToggle('poop', checked)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="prepopulate-shower">{t('settings.prepopulateShower')}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t('settings.prepopulateShowerDescription')}
                  </p>
                </div>
                <Switch
                  id="prepopulate-shower"
                  checked={prepopulateShowerTime}
                  onCheckedChange={(checked) => handlePrepopulateToggle('shower', checked)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.notifications')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t('settings.notificationsDescription')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
