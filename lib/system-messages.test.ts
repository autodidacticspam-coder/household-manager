import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import zh from '@/messages/zh.json';
import { flattenMessages, translateSystemMessage } from './system-messages';

describe('interface language coverage', () => {
  it('keeps all three dictionaries complete and renders plural messages', () => {
    expect(Object.keys(flattenMessages(es)).sort()).toEqual(Object.keys(flattenMessages(en)).sort());
    expect(Object.keys(flattenMessages(zh)).sort()).toEqual(Object.keys(flattenMessages(en)).sort());
    const t = createTranslator({ locale: 'es', messages: es });
    expect(t('interface.ratingCount', { count: 2 })).toBe('2 valoraciones');
    expect(t('interface.dayCount', { count: 1 })).toBe('1 día');
  });
  it('translates dynamic feedback without changing names or exposing technical details', () => {
    const t = createTranslator({ locale: 'es', messages: es });
    const current = new Set(Object.values(flattenMessages(es)));
    const translate = (key: string, values?: Record<string, string>) => t(key as Parameters<typeof t>[0], values);
    expect(translateSystemMessage('Template "Evening" saved', translate, current)).toBe('Plantilla «Evening» guardada');
    expect(translateSystemMessage('Not authenticated', translate, current)).toBe('Inicia sesión para continuar.');
    expect(translateSystemMessage('Storage error: private diagnostics', translate, current)).not.toContain('private diagnostics');
    expect(translateSystemMessage(es.leaveErrors.timeOrder, translate, current)).toBe(es.leaveErrors.timeOrder);
  });
});
