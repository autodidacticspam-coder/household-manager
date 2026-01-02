'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export default function EmployeeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Log the error to console for debugging
    console.error('Employee section error:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Something went wrong
        </h2>
        <p className="text-gray-600 mb-4">
          {error.message || 'An unexpected error occurred'}
        </p>
        {error.digest && (
          <p className="text-xs text-gray-400 mb-4">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex gap-2 justify-center">
          <Button onClick={reset} variant="default">
            Try again
          </Button>
          <Button onClick={() => router.push('/my-tasks')} variant="outline">
            Go to My Tasks
          </Button>
        </div>
      </div>
    </div>
  );
}
