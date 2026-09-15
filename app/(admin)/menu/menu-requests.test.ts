import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), push: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc }) }));
vi.mock('@/lib/notifications/menu-push', () => ({ scheduleMenuPushes: mocks.push }));
import { requestMenuSwap, respondToMenuSwap, saveWeeklyMenu } from './actions';
import { MENU_DAYS } from '@/lib/validators/menu-swap';
const request = { weekStart: '2026-09-14', from: { day: 'Tuesday', mealType: 'lunch' }, to: { day: 'Tuesday', mealType: 'dinner' }, expectedUpdatedAt: '2026-09-14T18:00:00.123456+00:00', note: 'Please swap.' };
const response = { id: '00000000-0000-4000-8000-000000000001', decision: 'accepted', reply: 'Yes.' };
const menu = { weekStart: request.weekStart, expectedUpdatedAt: request.expectedUpdatedAt,
  meals: MENU_DAYS.map(day => ({ day, breakfast: '', lunch: '', dinner: '', snacks: '' })), notes: 'Notes' };

describe('menu request and save boundaries', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null }); mocks.rpc.mockResolvedValue({ data: 'accepted', error: null }); });
  it('requests approval through the RPC with the loaded revision and queues committed notifications', async () => {
    expect(await requestMenuSwap({ ...request, requested_by: 'forged-user' })).toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith('request_menu_swap', { p_week_start: request.weekStart, p_day_a: 'Tuesday', p_meal_a: 'lunch',
      p_day_b: 'Tuesday', p_meal_b: 'dinner', p_expected_updated_at: request.expectedUpdatedAt, p_note: request.note });
    expect(mocks.push).toHaveBeenCalledWith('verified-user');
  });
  it.each([ { ...request, to: request.from }, { ...request, expectedUpdatedAt: null }, { ...request, weekStart: '2026-02-30' },
    { ...request, weekStart: '2026-09-15' }, { ...request, note: 'x'.repeat(2001) } ])('rejects invalid requests before database access', async input => {
    expect(await requestMenuSwap(input)).toEqual({ error: 'invalidRequest' }); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('uses the server response status when a requested meal is stale', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 'stale', error: null });
    expect(await respondToMenuSwap(response)).toEqual({ success: true, status: 'stale' });
    expect(mocks.rpc).toHaveBeenCalledWith('respond_to_menu_swap', { p_id: response.id, p_decision: 'accepted', p_reply: 'Yes.' });
  });
  it.each(['menuChanged','alreadyRequested','alreadyResponded','noChef','responseNotAllowed'])('preserves a safe %s error without sending a notification', async message => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message } });
    expect(await respondToMenuSwap(response)).toEqual({ error: message }); expect(mocks.push).not.toHaveBeenCalled();
  });
  it('requires a verified login for every mutation', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await requestMenuSwap(request)).toEqual({ error: 'requestNotAllowed' });
    expect(await respondToMenuSwap(response)).toEqual({ error: 'responseNotAllowed' });
    expect(await saveWeeklyMenu(menu)).toEqual({ error: 'saveNotAllowed' });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('saves the full editor against the revision when editing began', async () => {
    expect(await saveWeeklyMenu(menu)).toEqual({ success: true });
    expect(mocks.rpc).toHaveBeenCalledWith('save_weekly_menu', { p_week_start: request.weekStart, p_meals: menu.meals, p_notes: 'Notes', p_expected_updated_at: request.expectedUpdatedAt });
  });
  it('rejects a missing day and hides transport failure details', async () => {
    expect(await saveWeeklyMenu({ ...menu, meals: menu.meals.slice(1) })).toEqual({ error: 'invalidMenu' });
    mocks.rpc.mockRejectedValueOnce(new Error('private credentials'));
    expect(await requestMenuSwap(request)).toEqual({ error: 'requestFailed' }); expect(mocks.push).not.toHaveBeenCalled();
  });
});
