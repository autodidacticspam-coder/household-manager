import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '@/messages/en.json';
import type { FoodRequest } from '@/hooks/use-food-requests';

const mocks = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock('@/hooks/use-food-requests', () => ({ useUpdateFoodRequestNotes: () => mocks }));
import { FoodRequestNotesDialog } from './food-request-notes-dialog';

const request: FoodRequest = {
  id: '00000000-0000-4000-8000-000000000001', foodName: 'Noodles', canonicalFoodName: 'Noodles',
  requestedBy: 'admin', notes: 'No peanuts', recipeId: null, status: 'pending', completedAt: null,
  completedBy: null, createdAt: '2026-09-06T20:00:00Z', updatedAt: '2026-09-06T20:00:00.123456+00:00',
};

function openEditor(value = request) {
  const onClose = vi.fn();
  render(<NextIntlClientProvider locale="en" messages={messages} timeZone="America/Los_Angeles">
    <FoodRequestNotesDialog request={value} onClose={onClose} />
  </NextIntlClientProvider>);
  return onClose;
}

describe('food request notes editor', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.isPending = false; mocks.mutateAsync.mockResolvedValue({ success: true }); });
  afterEach(cleanup);

  it('prefills existing notes and cancels without saving', () => {
    const onClose = openEditor();
    const notes = screen.getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement;
    expect(notes.value).toBe('No peanuts');
    expect((screen.getByRole('button', { name: 'Save notes' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(notes, { target: { value: 'Unsaved draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it('saves the edited notes with their original version and closes after success', async () => {
    const onClose = openEditor();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'No peanuts\nMild sauce' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ id: request.id, notes: 'No peanuts\nMild sauce', updatedAt: request.updatedAt });
  });

  it('supports adding notes to a request without notes', async () => {
    const onClose = openEditor({ ...request, notes: null });
    expect(screen.getByRole('heading', { name: 'Add notes' })).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Sauce on the side' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ id: request.id, notes: 'Sauce on the side', updatedAt: request.updatedAt });
  });

  it('allows clearing existing notes', async () => {
    const onClose = openEditor();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ id: request.id, notes: '', updatedAt: request.updatedAt });
  });

  it.each(['conflict', 'network'])('keeps the draft open after a %s error', async kind => {
    if (kind === 'conflict') mocks.mutateAsync.mockResolvedValueOnce({ error: messages.foodRequests.notesChanged });
    else mocks.mutateAsync.mockRejectedValueOnce(new Error('offline'));
    const onClose = openEditor();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Keep this draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save notes' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(kind === 'conflict' ? messages.foodRequests.notesChanged : messages.foodRequests.saveNotesFailed);
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('Keep this draft');
    expect(onClose).not.toHaveBeenCalled();
  });
});
