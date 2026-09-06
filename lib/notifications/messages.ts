import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import zh from '@/messages/zh.json';
import { isDateOnly } from '@/lib/leave-dates';

export type PushMessageKind = 'assigned' | 'reminder' | 'completed' | 'booking' | 'accepted' | 'declined' | 'shiftCancelled' | 'requestCancelled' | 'expiring';
export type PushValues = Record<string, string | number>;

export function localizedPushMessage(locale: string, kind: PushMessageKind, values: PushValues) {
  const language = locale === 'es' || locale === 'zh' ? locale : 'en';
  const messages = { en, es, zh }[language];
  const t = createTranslator({ locale: language, messages: messages.pushMessages });
  const input = { ...values };
  if (typeof input.date === 'string' && isDateOnly(input.date)) {
    input.date = new Intl.DateTimeFormat(language, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(input.date + 'T12:00:00Z'));
  }
  if (typeof input.priority === 'string') {
    const key = input.priority as 'low' | 'medium' | 'high' | 'urgent';
    input.priority = t.has(key) ? t(key) : input.priority;
  }
  return { title: t(`${kind}Title`), body: t(`${kind}Body`, input) };
}
