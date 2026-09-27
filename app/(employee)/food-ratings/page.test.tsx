import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { id: 'admin' }, isAdmin: true }) }));
vi.mock('@/hooks/use-menu-ratings', () => ({
  useCanAccessFoodRatings: () => ({ data: true }),
  useMenuRatingsSummary: () => ({ data: ['Rice noodles', 'Rice soup', 'Salad'].map(menuItem => ({
    menuItem, rawMenuItems: [menuItem], averageRating: 8, minRating: 7, maxRating: 9,
    totalRatings: 2, raters: ['Family'],
  })) }),
  useAllMenuRatings: () => ({ data: [] }),
  useDeleteMenuRating: () => ({}),
}));
vi.mock('@/hooks/use-food-requests', () => ({
  useFoodRequests: () => ({ data: [] }),
  usePendingFoodRequestsCount: () => ({ data: 0 }),
  useCreateFoodRequest: () => mocks,
  useCompleteFoodRequest: () => ({}),
  useDeleteFoodRequest: () => ({}),
}));
vi.mock('@/hooks/use-menu-item-merges', () => ({ useMenuItemMerges: () => ({ data: [] }) }));
vi.mock('@/hooks/use-food-note-responses', () => ({ useCanRespondToFoodNotes: () => ({ data: false }) }));
vi.mock('@/hooks/use-menu-tags', () => ({
  useMenuTags: () => ({ data: [] }),
  useTaggableMenuItems: () => ({ data: [] }),
  useSetDishTag: () => ({}),
  buildDishTagLookup: () => new Map(),
}));
vi.mock('@/hooks/use-meal-suggestions', () => ({ useMealSuggestionHistory: () => ({ data: null }) }));
import FoodRatingsPage from './page';

function renderPage() {
  return render(<NextIntlClientProvider locale="en" messages={messages} timeZone="America/Los_Angeles">
    <FoodRatingsPage />
  </NextIntlClientProvider>);
}

function openDishRequest(name: string) {
  const row = screen.getAllByRole('row').find(row => row.textContent?.includes(name));
  expect(row).toBeTruthy();
  fireEvent.click(within(row!).getByRole('button', { name: 'Request' }));
}

async function completeRequest() {
  fireEvent.click(screen.getByRole('button', { name: 'Submit Request' }));
  act(() => mocks.mutate.mock.lastCall![1].onSuccess());
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

describe('food request submission keeps the current page', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.isPending = false; });
  afterEach(cleanup);

  it('keeps the dish list and search so another dish can be requested immediately', async () => {
    renderPage();
    fireEvent.change(screen.getByPlaceholderText('Search dishes...'), { target: { value: 'Rice' } });
    openDishRequest('Rice noodles');
    fireEvent.change(screen.getByLabelText('Notes (optional)'), { target: { value: 'Mild please' } });
    await completeRequest();

    expect(screen.getByRole('tab', { name: 'Summary' }).getAttribute('aria-selected')).toBe('true');
    expect((screen.getByPlaceholderText('Search dishes...') as HTMLInputElement).value).toBe('Rice');
    expect(screen.queryByRole('cell', { name: 'Salad' })).toBeNull();
    expect(mocks.mutate.mock.calls[0][0]).toEqual({ foodName: 'Rice noodles', notes: 'Mild please' });

    openDishRequest('Rice soup');
    expect((screen.getByLabelText('Dish') as HTMLInputElement).value).toBe('Rice soup');
    expect((screen.getByLabelText('Notes (optional)') as HTMLTextAreaElement).value).toBe('');
    await completeRequest();
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
    expect(mocks.mutate.mock.calls[1][0]).toEqual({ foodName: 'Rice soup', notes: null });
    expect(screen.getByRole('tab', { name: 'Summary' }).getAttribute('aria-selected')).toBe('true');
  });

  it.each(['History', 'Insights'])('keeps the %s request view after submitting', async view => {
    renderPage();
    fireEvent.mouseDown(screen.getByRole('tab', { name: new RegExp(messages.foodRequests.title) }), { button: 0, ctrlKey: false });
    fireEvent.mouseDown(screen.getByRole('tab', { name: new RegExp(`^${view}`) }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole('button', { name: 'New request' }));
    fireEvent.change(screen.getByLabelText('Dish'), { target: { value: 'Rice noodles' } });
    await completeRequest();
    expect(screen.getByRole('tab', { name: new RegExp(`^${view}`) }).getAttribute('aria-selected')).toBe('true');
  });

  it('keeps the draft and current view until the request succeeds', async () => {
    const page = renderPage();
    openDishRequest('Rice noodles');
    fireEvent.change(screen.getByLabelText('Notes (optional)'), { target: { value: 'Keep these notes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Request' }));
    mocks.isPending = true;
    page.rerender(<NextIntlClientProvider locale="en" messages={messages} timeZone="America/Los_Angeles">
      <FoodRatingsPage />
    </NextIntlClientProvider>);
    expect((screen.getByRole('button', { name: 'Submit Request' }) as HTMLButtonElement).disabled).toBe(true);
    // A failed mutation never invokes onSuccess; the user can retry the same draft.
    mocks.isPending = false;
    page.rerender(<NextIntlClientProvider locale="en" messages={messages} timeZone="America/Los_Angeles">
      <FoodRatingsPage />
    </NextIntlClientProvider>);
    expect((screen.getByLabelText('Dish') as HTMLInputElement).value).toBe('Rice noodles');
    expect((screen.getByLabelText('Notes (optional)') as HTMLTextAreaElement).value).toBe('Keep these notes');
    await completeRequest();
    expect(screen.getByRole('tab', { name: 'Summary' }).getAttribute('aria-selected')).toBe('true');
  });
});
