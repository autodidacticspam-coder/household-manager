import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}));
import { respondToFoodNote } from './actions';

const input = {
  source: 'request', id: '00000000-0000-4000-8000-000000000001',
  noteRevision: '00000000-0000-4000-8000-000000000002', reply: null,
};

describe('chef food note response action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'chef' } }, error: null });
    mocks.rpc.mockResolvedValue({ error: null });
  });

  it('acknowledges the exact request note through the authorized database function', async () => {
    await expect(respondToFoodNote({ ...input, responded_by: 'another-chef', status: 'completed' })).resolves.toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith('respond_to_food_note', {
      p_source: 'request', p_id: input.id, p_note_revision: input.noteRevision,
    });
  });

  it('trims a rating reply while preserving line breaks', async () => {
    await expect(respondToFoodNote({ ...input, source: 'rating', reply: '  Less salt next time.\nThank you!  ' })).resolves.toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith('respond_to_food_note', {
      p_source: 'rating', p_id: input.id, p_note_revision: input.noteRevision, p_reply: 'Less salt next time.\nThank you!',
    });
  });

  it.each([
    { ...input, source: 'other' }, { ...input, id: 'invalid' }, { ...input, noteRevision: undefined },
    { ...input, reply: '' }, { ...input, reply: ' \n ' }, { ...input, reply: 'x'.repeat(10001) },
  ])('rejects invalid input before database access', async invalid => {
    await expect(respondToFoodNote(invalid)).resolves.toEqual({ error: 'invalidResponse' });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('requires a verified session', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(respondToFoodNote(input)).resolves.toEqual({ error: 'responseNotAllowed' });
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'chef' } }, error: { message: 'expired' } });
    await expect(respondToFoodNote(input)).resolves.toEqual({ error: 'responseNotAllowed' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: '42501', message: 'private details' }, 'responseNotAllowed'],
    [{ code: '40001', message: 'noteChanged' }, 'noteChanged'],
    [{ code: '40001', message: 'responseChanged' }, 'responseChanged'],
    [{ code: 'XX000', message: 'private details' }, 'saveResponseFailed'],
  ])('reports permissions, conflicts, and database failures safely', async (error, result) => {
    mocks.rpc.mockResolvedValueOnce({ error });
    await expect(respondToFoodNote(input)).resolves.toEqual({ error: result });
  });

  it('does not claim a save when the connection fails', async () => {
    mocks.rpc.mockRejectedValueOnce(new Error('private connection details'));
    await expect(respondToFoodNote(input)).resolves.toEqual({ error: 'saveResponseFailed' });
  });
});
