import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';
const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), data: [] as unknown[], user: { id: 'chef' } }));
vi.mock('@/hooks/use-menu-requests', () => ({
  useMenuRequests: () => ({ data: mocks.data, isLoading: false, isError: false }),
  useMenuRequestMutation: () => ({ mutateAsync: mocks.mutateAsync, isPending: false }),
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: mocks.user }) }));
import { MenuChangeRequests } from './menu-change-requests';
const request = { id: 'request', day_a: 'Tuesday', meal_a: 'lunch', day_b: 'Tuesday', meal_b: 'dinner', content_a: 'Soup', content_b: 'Pasta',
  requested_by: 'admin', requester: { full_name: 'Admin' }, responder: null, responded_at: null, created_at: '2026-09-14T18:00:00Z', status: 'pending', note: 'Guests at lunch', reply: null };
function view(canRespond = true) { return <NextIntlClientProvider locale="en" messages={messages} timeZone="America/Los_Angeles"><MenuChangeRequests weekStart="2026-09-14" canRespond={canRespond} enabled /></NextIntlClientProvider>; }
describe('menu request responses', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.data = [request]; mocks.user.id = 'chef'; mocks.mutateAsync.mockResolvedValue({ success: true, status: 'accepted' }); });
  afterEach(cleanup);
  it('lets a chef accept with a reply, showing both requested meals', async () => {
    render(view());
    expect(screen.getByText('Soup')).toBeTruthy(); expect(screen.getByText('Pasta')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Reply (optional)'), { target: { value: 'Sure, that works.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept and swap' }));
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith({ id: 'request', decision: 'accepted', reply: 'Sure, that works.' }));
  });
  it('sends a rejection and shows a save failure without pretending it was answered', async () => {
    mocks.mutateAsync.mockResolvedValue({ error: 'Could not save' });
    render(view()); fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Could not save');
    expect(screen.getByText('Awaiting chef')).toBeTruthy();
  });
  it('shows the persisted reply and result to the admin without chef controls', () => {
    mocks.user.id = 'admin'; mocks.data = [{ ...request, status: 'rejected', reply: 'Already prepared.', responder: { full_name: 'Chef Ana' }, responded_at: request.created_at }];
    render(view(false));
    expect(screen.getByText(/Already prepared/)).toBeTruthy(); expect(screen.getByText(/Chef Ana/)).toBeTruthy();
    expect(screen.getByText('Rejected')).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Accept and swap' })).toBeNull();
  });
  it('lets only the requesting admin withdraw their pending request', async () => {
    mocks.user.id = 'admin'; render(view(false));
    expect(screen.queryByRole('button', { name: 'Accept and swap' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw request' }));
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith({ id: 'request', decision: 'cancelled', reply: '' }));
  });
});
