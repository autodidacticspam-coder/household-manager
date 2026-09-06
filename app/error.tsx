'use client';
import { useTranslations } from 'next-intl';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const tUi = useTranslations('interface');
  useEffect(() => {
    // Log the error to console for debugging
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          {tUi('somethingWentWrong')} </h2>
        <p className="text-gray-600 mb-4">
          {tUi('anUnexpectedErrorOccurred')}
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400 mb-4">
            {tUi('errorId')} {error.digest}
          </p>
        )}
        <div className="flex gap-2 justify-center">
          <Button onClick={reset} variant="default">
            {tUi('tryAgain')} </Button>
          <Button onClick={() => window.location.href = '/dashboard'} variant="outline">
            {tUi('goToDashboard')} </Button>
        </div>
      </div>
    </div>
  );
}
