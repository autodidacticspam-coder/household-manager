import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';
import es from '@/messages/es.json';
import zh from '@/messages/zh.json';
import type { ComponentProps } from 'react';

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock('@/hooks/use-food-note-responses', () => ({ useRespondToFoodNote: () => mocks }));
import { FoodNoteResponse } from './food-note-response';

const props: ComponentProps<typeof FoodNoteResponse> = {
  source: 'request', id: 'request-id', noteRevision: 'revision-1', responses: [], canRespond: true, userId: 'chef-id',
};
const response = {
  id: 'response-id', respondedBy: 'chef-id', chefName: 'Chef Sam', reply: null,
  receivedAt: '2026-09-08T17:00:00Z', repliedAt: null,
};
function view(overrides: Partial<typeof props> = {}) {
  return <NextIntlClientProvider locale="en" messages={messages} timeZone="America/Los_Angeles">
    <FoodNoteResponse {...props} {...overrides} />
  </NextIntlClientProvider>;
}

describe('food note replies and receipts', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.isPending = false; mocks.mutateAsync.mockResolvedValue({ success: true }); });
  afterEach(cleanup);

  it('marks a note received without requiring a comment', async () => {
    render(view());
    fireEvent.click(screen.getByRole('button', { name: 'Mark received' }));
    await waitFor(() => expect(mocks.mutateAsync).toHaveBeenCalledWith({ source: 'request', id: props.id, noteRevision: 'revision-1', reply: null }));
  });

  it('requires a nonblank reply and clears the editor only after a successful save', async () => {
    render(view({ source: 'rating' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    const input = screen.getByRole('textbox', { name: 'Your reply' });
    expect((screen.getByRole('button', { name: 'Send reply' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'Less salt next time.\nThank you!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ source: 'rating', id: props.id, noteRevision: 'revision-1', reply: 'Less salt next time.\nThank you!' });
  });

  it.each(['returned', 'thrown'])('keeps the draft and displays a save error (%s)', async kind => {
    if (kind === 'returned') mocks.mutateAsync.mockResolvedValueOnce({ error: messages.foodNoteResponses.saveResponseFailed });
    else mocks.mutateAsync.mockRejectedValueOnce(new Error('network'));
    render(view());
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    expect((await screen.findByRole('alert')).textContent).toBe(messages.foodNoteResponses.saveResponseFailed);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Keep this draft');
  });

  it('preserves the draft and prevents sending when the underlying note changes', () => {
    const { rerender } = render(view());
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Reply to old wording' } });
    rerender(view({ noteRevision: 'revision-2' }));
    expect(screen.getByRole('alert').textContent).toBe(messages.foodNoteResponses.noteChanged);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Reply to old wording');
    expect((screen.getByRole('button', { name: 'Send reply' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it('allows adding a reply after marking received', () => {
    render(view({ responses: [response] }));
    expect(screen.getByText('Received by Chef Sam')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mark received' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('shows the saved chef reply to the note author without chef controls', () => {
    render(view({ canRespond: false, userId: 'admin-id', responses: [{ ...response, reply: 'I will adjust it.', repliedAt: response.receivedAt }] }));
    expect(screen.getByText('Reply from Chef Sam')).toBeTruthy();
    expect(screen.getByText('I will adjust it.')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('disables duplicate actions while saving', () => {
    mocks.isPending = true;
    render(view());
    for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('cancels a draft without saving', () => {
    render(view());
    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Unsaved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it.each([['es', es], ['zh', zh]] as const)('translates the controls in %s', (locale, translated) => {
    render(<NextIntlClientProvider locale={locale} messages={translated} timeZone="America/Los_Angeles"><FoodNoteResponse {...props} /></NextIntlClientProvider>);
    expect(screen.getByRole('button', { name: translated.foodNoteResponses.markReceived })).toBeTruthy();
    expect(screen.getByRole('button', { name: translated.foodNoteResponses.reply })).toBeTruthy();
  });
});
