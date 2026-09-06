'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useUser } from '@/hooks/use-user';
import { useFeedback } from '@/hooks/use-feedback';

export function useLanguagePreference() {
  const { updateUserAsync } = useUser();
  const router = useRouter();
  const feedback = useFeedback();
  const [isChangingLanguage, setIsChangingLanguage] = useState(false);

  const changeLanguage = async (locale: 'en' | 'es' | 'zh') => {
    setIsChangingLanguage(true);
    try {
      // Save first: /api/user restores the saved preference on every session refresh.
      await updateUserAsync({ preferredLocale: locale });
      const response = await fetch('/api/locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      if (!response.ok) throw new Error('Unable to save language preference');
      router.refresh();
    } catch (error) {
      toast.error(feedback(error instanceof Error ? error.message : 'Unable to save language preference'));
    } finally {
      setIsChangingLanguage(false);
    }
  };

  return { changeLanguage, isChangingLanguage };
}
