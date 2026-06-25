import type { Session } from '@supabase/supabase-js';

export const ADMIN_SWITCH_SESSION_KEY = 'household-manager.admin-switch-session';

export type StoredAdminSwitchSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  adminUser: {
    id: string;
    email: string | null;
    fullName: string;
  };
  targetUser: {
    id: string;
    email: string;
    fullName: string;
  };
  startedAt: string;
};

export function saveAdminSwitchSession(input: {
  session: Session;
  adminName: string;
  targetUser: StoredAdminSwitchSession['targetUser'];
}) {
  if (typeof window === 'undefined') return;

  const stored: StoredAdminSwitchSession = {
    accessToken: input.session.access_token,
    refreshToken: input.session.refresh_token,
    expiresAt: input.session.expires_at ?? null,
    adminUser: {
      id: input.session.user.id,
      email: input.session.user.email ?? null,
      fullName: input.adminName,
    },
    targetUser: input.targetUser,
    startedAt: new Date().toISOString(),
  };

  window.sessionStorage.setItem(ADMIN_SWITCH_SESSION_KEY, JSON.stringify(stored));
}

export function readAdminSwitchSession(): StoredAdminSwitchSession | null {
  if (typeof window === 'undefined') return null;

  const raw = window.sessionStorage.getItem(ADMIN_SWITCH_SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredAdminSwitchSession>;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.adminUser?.id) {
      clearAdminSwitchSession();
      return null;
    }
    return parsed as StoredAdminSwitchSession;
  } catch {
    clearAdminSwitchSession();
    return null;
  }
}

export function clearAdminSwitchSession() {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(ADMIN_SWITCH_SESSION_KEY);
}
