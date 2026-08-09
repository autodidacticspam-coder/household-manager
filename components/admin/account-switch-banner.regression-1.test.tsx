import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ clear: vi.fn() }),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: (() => {
    const authState = {
      user: { id: 'employee-id', fullName: 'Sasha' },
      isLoading: false,
    };

    return () => authState;
  })(),
}));

vi.mock('@/lib/account-switch', () => ({
  clearAdminSwitchSession: vi.fn(),
  readAdminSwitchSession: () => ({
    accessToken: 'admin-access-token',
    refreshToken: 'admin-refresh-token',
    expiresAt: null,
    adminUser: {
      id: 'admin-id',
      email: 'admin@example.com',
      fullName: 'Administrator',
    },
    targetUser: {
      id: 'employee-id',
      email: 'sasha@example.com',
      fullName: 'Sasha',
    },
    startedAt: '2026-08-08T00:00:00.000Z',
  }),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { setSession: vi.fn() },
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { AccountSwitchBanner } from '@/components/admin/account-switch-banner';

// Regression: the mobile account-switch banner rendered beneath the iOS status bar.
describe('AccountSwitchBanner', () => {
  it('positions the return action below the device safe area', async () => {
    const { container } = render(<AccountSwitchBanner />);

    expect(await screen.findByRole('button', { name: 'Return to Admin' })).toBeTruthy();
    await waitFor(() => expect(container.firstElementChild).not.toBeNull());

    const topOffset = (container.firstElementChild as HTMLElement).style.top;
    expect(topOffset).toContain('safe-area-inset-top');
    expect(topOffset).toContain('0.5rem');
  });
});
