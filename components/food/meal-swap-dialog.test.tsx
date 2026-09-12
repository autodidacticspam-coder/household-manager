import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';
import es from '@/messages/es.json';
import zh from '@/messages/zh.json';
import type { ComponentProps } from 'react';
import type { DayMeals } from '@/types';

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock('@/hooks/use-menu-swap', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/use-menu-swap')>()),
  useSwapMenuMeals: () => mocks,
}));
import { MealSwapDialog } from './meal-swap-dialog';

const empty = { breakfast: '', lunch: '', dinner: '', snacks: '' };
const meals: DayMeals[] = [
  { day: 'Monday', ...empty, breakfast: 'Oatmeal' },
  { day: 'Tuesday', ...empty, lunch: 'Chicken curry\nRice\nSalad', dinner: 'Soup' },
  { day: 'Wednesday', ...empty, dinner: 'Pasta' },
  { day: 'Thursday', ...empty },
  { day: 'Friday', ...empty },
  { day: 'Saturday', ...empty },
  { day: 'Sunday', ...empty },
];
const props: ComponentProps<typeof MealSwapDialog> = {
  source: { day: 'Tuesday', mealType: 'lunch' },
  meals,
  weekStart: '2026-09-07',
  weekStartDate: new Date(2026, 8, 7),
  menuUpdatedAt: '2026-09-08T15:14:47.123456+00:00',
  onClose: vi.fn(),
};
function view(overrides: Partial<typeof props> = {}, locale = 'en', translated: typeof messages = messages) {
  return <NextIntlClientProvider locale={locale} messages={translated} timeZone="America/Los_Angeles">
    <MealSwapDialog {...props} {...overrides} />
  </NextIntlClientProvider>;
}
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('meal swap dialog', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.isPending = false; mocks.mutateAsync.mockResolvedValue({ success: true, updatedAt: 'v2' }); });
  afterEach(cleanup);

  it('starts on the meal being swapped and previews every meal of that day', () => {
    render(view());
    expect(screen.getByRole('heading', { name: 'Swap Tuesday Lunch' })).toBeTruthy();
    expect(screen.getByText('Chicken curry Rice Salad')).toBeTruthy();
    expect(button('Tuesday').getAttribute('aria-pressed')).toBe('true');
    expect(button('Wednesday').getAttribute('aria-pressed')).toBe('false');
    expect(button('Tuesday').textContent).toBe('Tue8');
    const source = button(/^Lunch/);
    expect(source.disabled).toBe(true);
    expect(source.textContent).toContain('This meal');
    expect(source.textContent).toContain('Chicken curry');
    expect(source.textContent).toContain('+2 more');
    expect(button(/^Dinner/).textContent).toContain('Soup');
    expect(button(/^Breakfast/).textContent).toContain('Empty');
    expect(button(/^Breakfast/).disabled).toBe(false);
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it('swaps with the chosen meal of another day and closes after a successful save', async () => {
    render(view());
    fireEvent.click(button('Wednesday'));
    expect(button('Wednesday').getAttribute('aria-pressed')).toBe('true');
    expect(button(/^Lunch/).disabled).toBe(false);
    expect(button(/^Lunch/).textContent).toContain('Empty');
    fireEvent.click(button(/^Dinner/));
    await waitFor(() => expect(props.onClose).toHaveBeenCalledOnce());
    expect(mocks.mutateAsync).toHaveBeenCalledWith({
      from: { day: 'Tuesday', mealType: 'lunch' },
      to: { day: 'Wednesday', mealType: 'dinner' },
      expectedUpdatedAt: props.menuUpdatedAt,
    });
  });

  it('allows moving a meal into an empty slot of the same day', async () => {
    render(view());
    fireEvent.click(button(/^Snacks/));
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ to: { day: 'Tuesday', mealType: 'snacks' } })));
  });

  it.each(['returned', 'thrown'])('stays open and shows the problem when the swap fails (%s)', async kind => {
    if (kind === 'returned') mocks.mutateAsync.mockResolvedValueOnce({ error: messages.menuSwap.menuChanged });
    else mocks.mutateAsync.mockRejectedValueOnce(new Error('network'));
    render(view());
    fireEvent.click(button(/^Dinner/));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(kind === 'returned' ? messages.menuSwap.menuChanged : messages.menuSwap.swapFailed);
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Swap Tuesday Lunch' })).toBeTruthy();
  });

  it('blocks every action while a swap is saving', () => {
    mocks.isPending = true;
    render(view());
    expect(screen.getByText('Swapping…')).toBeTruthy();
    for (const control of screen.getAllByRole('button')) expect((control as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  it('closes without saving when cancelled', () => {
    render(view());
    fireEvent.click(button('Cancel'));
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it.each([['es', es], ['zh', zh]] as const)('translates the picker in %s', (locale, translated) => {
    render(view({}, locale, translated as unknown as typeof messages));
    expect(screen.getByRole('heading').textContent).toBe(translated.menuSwap.title.replace('{slot}', translated.menuSwap.slot
      .replace('{day}', translated.menu.days.tuesday).replace('{meal}', translated.menu.meals.lunch)));
    expect(screen.getByRole('button', { name: translated.menuSwap.cancel })).toBeTruthy();
    expect(screen.getByRole('button', { name: translated.menu.days.wednesday })).toBeTruthy();
  });
});
