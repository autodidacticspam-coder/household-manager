'use client';
import { useCallback, useMemo } from 'react';
import { useMessages, useTranslations } from 'next-intl';
import { flattenMessages, translateSystemMessage } from '@/lib/system-messages';

export function useFeedback() {
  const t = useTranslations();
  const messages = useMessages();
  const current = useMemo(() => new Set(Object.values(flattenMessages(messages))), [messages]);
  return useCallback((message: unknown) => translateSystemMessage(message, t, current), [t, current]);
}
