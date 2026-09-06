import { describe, expect, it } from 'vitest';
import { localizedPushMessage } from './messages';

describe('notification language', () => {
  it('localizes system text and date while preserving the original task name', () => {
    const values = { title: 'Kitchen check', date: '2026-09-07', count: 2 };
    const spanish = localizedPushMessage('es', 'expiring', values);
    const chinese = localizedPushMessage('zh', 'expiring', values);
    expect(spanish.body).toContain('Kitchen check');
    expect(spanish.body).toContain('lunes');
    expect(chinese.body).toContain('Kitchen check');
    expect(chinese.body).toContain('9月7日');
    expect(chinese.body).not.toContain('Monday');
  });
  it('uses distinct cancellation and acceptance messages', () => {
    expect(localizedPushMessage('es', 'accepted', { name: 'Alex', date: '2026-09-07', time: '9 AM' }).body).toContain('aceptó');
    expect(localizedPushMessage('zh', 'shiftCancelled', { date: '2026-09-07', time: '9 AM' }).body).toContain('移除');
  });
});
