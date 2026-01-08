'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useLocale } from 'next-intl';

/**
 * Component that syncs the user's preferred locale from the database to the cookie.
 * This ensures that when a user logs in on a new device or after clearing cookies,
 * their language preference is restored from their profile.
 */
export function LocaleSync() {
  const { user, isLoading } = useAuth();
  const currentLocale = useLocale();
  const hasSynced = useRef(false);

  useEffect(() => {
    // Only run once per session, after user data is loaded
    if (isLoading || hasSynced.current) return;

    // If user has a preferred locale that differs from current locale, sync it
    if (user?.preferredLocale && user.preferredLocale !== currentLocale) {
      hasSynced.current = true;

      // Set the locale cookie via API
      fetch('/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: user.preferredLocale }),
      }).then(() => {
        // Reload the page to apply the new locale
        window.location.reload();
      }).catch((error) => {
        console.error('Failed to sync locale:', error);
      });
    } else {
      // Mark as synced even if no change needed to prevent future checks
      hasSynced.current = true;
    }
  }, [user, isLoading, currentLocale]);

  // This component doesn't render anything
  return null;
}
