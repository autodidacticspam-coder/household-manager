import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), update: vi.fn(), eq: vi.fn(), send: vi.fn() }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ getAdminClient: () => ({ rpc: mocks.rpc, from: () => ({ update: mocks.update }) }) }));
vi.mock('./push-service', () => ({ sendPushToUsers: mocks.send }));
import { dispatchMenuPushes } from './menu-push';

const notification = { id: 'event', recipient_id: 'admin', actor_id: 'chef', kind: 'menu_updated', week_start: '2026-09-14', request_id: null, push_attempts: 1 };
describe('durable menu push delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: [notification], error: null });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockImplementation(() => ({ eq: async () => ({ error: null }) }));
    mocks.send.mockResolvedValue({ sent: 1, failed: 0, errors: [] });
  });
  it('claims only the actor’s committed events and sends the stored recipient and week', async () => {
    expect(await dispatchMenuPushes('chef')).toBe(1);
    expect(mocks.rpc).toHaveBeenCalledWith('claim_menu_notification_pushes', { p_actor: 'chef' });
    expect(mocks.send.mock.calls[0][0]).toEqual(['admin']);
    expect(mocks.send.mock.calls[0][1]('es').data).toEqual({ type: 'menu_updated', weekStart: '2026-09-14', notificationId: 'event', requestId: '' });
    expect(mocks.update).toHaveBeenCalledWith({ push_state: 'sent' });
  });
  it('records unavailable device delivery while preserving the in-app notification', async () => {
    mocks.send.mockResolvedValue({ sent: 0, failed: 0, errors: ['No tokens found'] });
    await dispatchMenuPushes();
    expect(mocks.update).toHaveBeenCalledWith({ push_state: 'unavailable' });
  });
  it('retries a transport failure and stops after the third attempt', async () => {
    mocks.send.mockRejectedValue(new Error('network'));
    await dispatchMenuPushes();
    expect(mocks.update).toHaveBeenLastCalledWith({ push_state: 'pending' });
    mocks.rpc.mockResolvedValue({ data: [{ ...notification, push_attempts: 3 }], error: null });
    await dispatchMenuPushes();
    expect(mocks.update).toHaveBeenLastCalledWith({ push_state: 'failed' });
  });
  it('does not send when the outbox cannot be claimed', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'private' } });
    await expect(dispatchMenuPushes()).rejects.toThrow('Menu notification queue unavailable');
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
