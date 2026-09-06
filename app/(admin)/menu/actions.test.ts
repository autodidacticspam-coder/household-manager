import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), from: vi.fn(), update: vi.fn(), eq: vi.fn(),
  profile: vi.fn(), saved: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }),
}));
import { updateFoodRequestNotes } from './actions';

const input = {
  id: '00000000-0000-4000-8000-000000000001',
  notes: '  No peanuts.\nSauce on the side.  ',
  updatedAt: '2026-09-06T20:00:00.123456+00:00',
};

describe('food request note updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin' } }, error: null });
    mocks.profile.mockResolvedValue({ data: { role: 'admin' }, error: null });
    mocks.saved.mockResolvedValue({ data: { id: input.id }, error: null });
    const query = { update: mocks.update, eq: mocks.eq, select: () => query, maybeSingle: mocks.saved };
    mocks.update.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.from.mockImplementation((table: string) => table === 'users'
      ? { select: () => ({ eq: () => ({ single: mocks.profile }) }) }
      : query);
  });

  it('updates only notes using the original version, preserving internal line breaks', async () => {
    await expect(updateFoodRequestNotes({ ...input, status: 'completed', requested_by: 'someone-else' })).resolves.toEqual({ success: true });
    expect(mocks.update).toHaveBeenCalledWith({ notes: 'No peanuts.\nSauce on the side.' });
    expect(mocks.eq).toHaveBeenCalledWith('id', input.id);
    expect(mocks.eq).toHaveBeenCalledWith('updated_at', input.updatedAt);
  });

  it('removes notes when the editor is cleared', async () => {
    await expect(updateFoodRequestNotes({ ...input, notes: ' \n ' })).resolves.toEqual({ success: true });
    expect(mocks.update).toHaveBeenCalledWith({ notes: null });
  });

  it.each([
    { ...input, id: 'not-an-id' },
    { ...input, notes: 'x'.repeat(10_001) },
    { ...input, updatedAt: undefined },
  ])('rejects invalid input before reaching the database', async invalid => {
    await expect(updateFoodRequestNotes(invalid)).resolves.toEqual({ error: 'invalidNotes' });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('requires an authenticated administrator before any write', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(updateFoodRequestNotes(input)).resolves.toEqual({ error: 'notesNotAllowed' });
    mocks.profile.mockResolvedValueOnce({ data: { role: 'employee' }, error: null });
    await expect(updateFoodRequestNotes(input)).resolves.toEqual({ error: 'notesNotAllowed' });
    mocks.profile.mockResolvedValueOnce({ data: null, error: { message: 'unavailable' } });
    await expect(updateFoodRequestNotes(input)).resolves.toEqual({ error: 'notesNotAllowed' });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('reports a stale or unavailable request without claiming success', async () => {
    mocks.saved.mockResolvedValueOnce({ data: null, error: null });
    await expect(updateFoodRequestNotes(input)).resolves.toEqual({ error: 'notesChanged' });
  });

  it('returns a safe error for database and transport failures', async () => {
    mocks.saved.mockResolvedValueOnce({ data: null, error: { message: 'private database details' } });
    await expect(updateFoodRequestNotes(input)).resolves.toEqual({ error: 'saveNotesFailed' });
    mocks.saved.mockRejectedValueOnce(new Error('private transport details'));
    await expect(updateFoodRequestNotes(input)).resolves.toEqual({ error: 'saveNotesFailed' });
  });
});
