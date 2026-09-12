import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import messages from '@/messages/en.json';

const mocks = vi.hoisted(() => ({ swap: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/app/(admin)/menu/actions', () => ({ swapMenuMeals: mocks.swap }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }));
import { useSwapMenuMeals } from './use-menu-swap';

const from = { day: 'Tuesday', mealType: 'lunch' } as const;
const to = { day: 'Wednesday', mealType: 'dinner' } as const;

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={messages} timeZone="America/Los_Angeles">{children}</NextIntlClientProvider>
    </QueryClientProvider>
  );
  return { ...renderHook(() => useSwapMenuMeals('2026-09-07'), { wrapper }), invalidate };
}

describe('menu swap mutation', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.swap.mockResolvedValue({ success: true, updatedAt: 'version-2' }); });

  it('sends the swap for the week, refreshes the menu and feedback, and offers an undo that swaps back against the saved version', async () => {
    const { result, invalidate } = setup();
    await act(async () => { await result.current.mutateAsync({ from, to, expectedUpdatedAt: 'version-1' }); });
    expect(mocks.swap).toHaveBeenCalledWith({ weekStart: '2026-09-07', from, to, expectedUpdatedAt: 'version-1' });
    await waitFor(() => expect(mocks.success).toHaveBeenCalledOnce());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['weekly-menu', '2026-09-07'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['menu-ratings'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['menu-ratings-all'] });
    const [message, options] = mocks.success.mock.calls[0];
    expect(message).toBe('Swapped Tuesday Lunch with Wednesday Dinner');
    expect(options.action.label).toBe('Undo');

    mocks.swap.mockResolvedValueOnce({ success: true, updatedAt: 'version-3' });
    act(() => { options.action.onClick(); });
    await waitFor(() => expect(mocks.swap).toHaveBeenLastCalledWith({ weekStart: '2026-09-07', from: to, to: from, expectedUpdatedAt: 'version-2' }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalledTimes(2));
    expect(mocks.success.mock.calls[1]).toEqual(['Swap undone']);
  });

  it('translates a refused swap for the dialog without toasting, and toasts only when an undo is refused', async () => {
    mocks.swap.mockResolvedValue({ error: 'menuChanged' });
    const { result, invalidate } = setup();
    let outcome!: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => { outcome = await result.current.mutateAsync({ from, to, expectedUpdatedAt: 'version-1' }); });
    expect(outcome).toEqual({ error: messages.menuSwap.menuChanged });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['weekly-menu', '2026-09-07'] }));
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();

    await act(async () => { await result.current.mutateAsync({ from: to, to: from, expectedUpdatedAt: 'version-2', undo: true }); });
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(messages.menuSwap.menuChanged));
  });

  it('reports a transport failure as a safe message', async () => {
    mocks.swap.mockRejectedValueOnce(new Error('private connection details'));
    const { result } = setup();
    let outcome!: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => { outcome = await result.current.mutateAsync({ from, to, expectedUpdatedAt: null }); });
    expect(outcome).toEqual({ error: messages.menuSwap.swapFailed });
  });
});
