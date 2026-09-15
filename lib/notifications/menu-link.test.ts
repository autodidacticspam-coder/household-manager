import { describe, expect, it } from 'vitest';
import { menuNotificationHref } from './menu-link';
import { localizedPushMessage } from './messages';

describe('menu push navigation and languages', () => {
  it('opens the requested week and request instead of the current week', () => {
    expect(menuNotificationHref({ type: 'swap_accepted', weekStart: '2026-09-21', requestId: '00000000-0000-4000-8000-000000000001' }))
      .toBe('/menu?week=2026-09-21#request-00000000-0000-4000-8000-000000000001');
    expect(menuNotificationHref({ type: 'task_assigned', taskId: 'task' })).toBeNull();
    expect(menuNotificationHref({ type: 'menu_updated', weekStart: 'https://invalid' })).toBe('/menu');
  });
  it.each(['en','es','zh'])('renders menu notifications in %s', locale => {
    for (const kind of ['menu_updated','swap_requested','swap_accepted','swap_rejected','swap_stale','swap_cancelled'] as const) {
      const value = localizedPushMessage(locale, kind, { date: '2026-09-14' });
      expect(value.title).not.toContain('Title'); expect(value.body).not.toContain('{date}');
      expect(value.body).not.toContain('Body'); expect(value.body.length).toBeGreaterThan(10);
    }
  });
});
