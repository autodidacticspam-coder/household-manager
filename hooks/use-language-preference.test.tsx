import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLanguagePreference } from './use-language-preference';

const mocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn(), error: vi.fn() }));
vi.mock('@/hooks/use-user', () => ({ useUser: () => ({ updateUserAsync: mocks.save }) }));
vi.mock('@/hooks/use-feedback', () => ({ useFeedback: () => () => 'Translated error' }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock('sonner', () => ({ toast: { error: mocks.error } }));

describe('language preference persistence', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true })); });

  it('waits for the saved profile before changing the cookie and refreshing', async () => {
    let finishSave!: () => void;
    mocks.save.mockReturnValue(new Promise<void>(resolve => { finishSave = resolve; }));
    const { result } = renderHook(() => useLanguagePreference());
    let change!: Promise<void>;
    act(() => { change = result.current.changeLanguage('es'); });
    expect(result.current.isChangingLanguage).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    await act(async () => { finishSave(); await change; });
    expect(mocks.save).toHaveBeenCalledWith({ preferredLocale: 'es' });
    expect(fetch).toHaveBeenCalledWith('/api/locale', expect.objectContaining({ body: '{"locale":"es"}' }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(result.current.isChangingLanguage).toBe(false);
  });

  it('stays on the page and shows translated feedback when saving fails', async () => {
    mocks.save.mockRejectedValue(new Error('Database diagnostic'));
    const { result } = renderHook(() => useLanguagePreference());
    await act(async () => { await result.current.changeLanguage('zh'); });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith('Translated error');
  });
});
