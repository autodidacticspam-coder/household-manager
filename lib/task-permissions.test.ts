import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }) }));
vi.mock('@/lib/supabase/api-helpers', () => ({ ApiError: class extends Error { constructor(message: string, public statusCode: number) { super(message); } } }));
import { requireTaskPermission } from './task-permissions';

const taskId = '00000000-0000-4000-8000-000000000001';
describe('task action authorization', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ data: { user: { id: 'employee' } } }); });
  it('rejects a viewer completing a task before any mutation', async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(requireTaskPermission(taskId, 'complete')).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.rpc).toHaveBeenCalledWith('can_access_task', { p_task_id: taskId, p_action: 'complete' });
  });
  it('fails closed when permissions cannot be loaded', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });
    await expect(requireTaskPermission(taskId, 'view')).rejects.toMatchObject({ statusCode: 500 });
  });
  it('requires authentication and accepts an authorized assignee', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(requireTaskPermission(taskId, 'complete')).rejects.toMatchObject({ statusCode: 401 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    await expect(requireTaskPermission(taskId, 'complete')).resolves.toMatchObject({ user: { id: 'employee' } });
  });
});
