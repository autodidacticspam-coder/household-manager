import { describe, expect, it, vi } from 'vitest';
import { createFormatter } from 'next-intl';

vi.mock('next-intl/server', () => ({ getRequestConfig: (config: unknown) => config }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'en' }) }) }));
import getConfig from './i18n';

describe('household date display', () => {
  it('keeps a late-evening completion on its household date when the server runs in UTC', async () => {
    const config = await getConfig({ requestLocale: Promise.resolve('en') });
    expect(config.timeZone).toBe('America/Los_Angeles');
    const format = createFormatter({ locale: config.locale, timeZone: config.timeZone });
    expect(format.dateTime(new Date('2026-08-23T01:00:00Z'), { month:'short',day:'numeric',year:'numeric' })).toBe('Aug 22, 2026');
  });
});
