import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }),
}));
import { swapMenuMeals } from './actions';

const input = {
  weekStart: '2026-09-07',
  from: { day: 'Tuesday', mealType: 'lunch' },
  to: { day: 'Wednesday', mealType: 'dinner' },
  expectedUpdatedAt: '2026-09-08T15:14:47.123456+00:00',
};

describe('menu meal swap action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'chef' } }, error: null });
    mocks.rpc.mockResolvedValue({ data: '2026-09-11T17:00:00.654321+00:00', error: null });
  });

  it('swaps through the authorized database function and returns the new menu version', async () => {
    await expect(swapMenuMeals({ ...input, updated_by: 'someone-else' })).resolves.toEqual({ success: true, updatedAt: '2026-09-11T17:00:00.654321+00:00' });
    expect(mocks.rpc).toHaveBeenCalledWith('swap_menu_meals', {
      p_week_start: '2026-09-07', p_day_a: 'Tuesday', p_meal_a: 'lunch', p_day_b: 'Wednesday', p_meal_b: 'dinner',
      p_expected_updated_at: input.expectedUpdatedAt,
    });
  });

  it('omits the version check when the menu version is unknown', async () => {
    await expect(swapMenuMeals({ ...input, expectedUpdatedAt: null })).resolves.toEqual({ success: true, updatedAt: '2026-09-11T17:00:00.654321+00:00' });
    expect(mocks.rpc).toHaveBeenCalledWith('swap_menu_meals', {
      p_week_start: '2026-09-07', p_day_a: 'Tuesday', p_meal_a: 'lunch', p_day_b: 'Wednesday', p_meal_b: 'dinner',
    });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(swapMenuMeals({ ...input, expectedUpdatedAt: '' })).resolves.toEqual({ success: true, updatedAt: null });
    expect(mocks.rpc).toHaveBeenLastCalledWith('swap_menu_meals', expect.not.objectContaining({ p_expected_updated_at: expect.anything() }));
  });

  it.each([
    { ...input, from: { day: 'Funday', mealType: 'lunch' } },
    { ...input, to: { day: 'Wednesday', mealType: 'brunch' } },
    { ...input, to: { ...input.from } },
    { ...input, weekStart: '09/07/2026' },
    { ...input, from: undefined },
  ])('rejects invalid input before database access', async invalid => {
    await expect(swapMenuMeals(invalid)).resolves.toEqual({ error: 'invalidSwap' });
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('requires a verified session', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await expect(swapMenuMeals(input)).resolves.toEqual({ error: 'swapNotAllowed' });
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'chef' } }, error: { message: 'expired' } });
    await expect(swapMenuMeals(input)).resolves.toEqual({ error: 'swapNotAllowed' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    [{ code: '42501', message: 'private details' }, 'swapNotAllowed'],
    [{ code: '40001', message: 'menuChanged' }, 'menuChanged'],
    [{ code: '22023', message: 'invalidSwap' }, 'invalidSwap'],
    [{ code: 'XX000', message: 'private details' }, 'swapFailed'],
  ])('reports permissions, conflicts, and database failures safely', async (error, result) => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error });
    await expect(swapMenuMeals(input)).resolves.toEqual({ error: result });
  });

  it('does not claim a swap when the connection fails', async () => {
    mocks.rpc.mockRejectedValueOnce(new Error('private connection details'));
    await expect(swapMenuMeals(input)).resolves.toEqual({ error: 'swapFailed' });
  });
});
