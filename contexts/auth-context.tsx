'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AuthUser } from '@/types';
import type { User, Session } from '@supabase/supabase-js';

type AuthContextType = {
  user: AuthUser | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  isAdmin: false,
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isRefreshing = useRef(false);

  const supabase = createClient();

  const fetchUserData = useCallback(async (authUser: User) => {
    try {
      const response = await fetch('/api/user');
      if (response.ok) {
        const data = await response.json();
        setUser({
          id: data.id,
          email: data.email,
          fullName: data.full_name,
          role: data.role,
          avatarUrl: data.avatar_url,
          phone: data.phone,
          smsNotificationsEnabled: data.sms_notifications_enabled,
          preferredLocale: data.preferred_locale,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        });
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    if (isRefreshing.current) return;
    isRefreshing.current = true;

    try {
      // Use getUser() which validates the token and refreshes if needed
      const { data: { user: authUser }, error } = await supabase.auth.getUser();

      if (error) {
        console.error('Session refresh error:', error);
        // Only clear session if it's truly invalid
        if (error.message?.includes('Invalid') || error.message?.includes('expired')) {
          setSession(null);
          setUser(null);
        }
        return;
      }

      if (authUser) {
        // Get the refreshed session
        const { data: { session: refreshedSession } } = await supabase.auth.getSession();
        setSession(refreshedSession);
        await fetchUserData(authUser);
      }
    } catch (error) {
      console.error('Error refreshing session:', error);
    } finally {
      isRefreshing.current = false;
    }
  }, [supabase, fetchUserData]);

  const refreshUser = useCallback(async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      await fetchUserData(authUser);
    }
  }, [supabase, fetchUserData]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        // Use getUser() instead of getSession() - it validates the token
        const { data: { user: authUser }, error } = await supabase.auth.getUser();

        if (error) {
          console.error('Auth init error:', error);
          setIsLoading(false);
          return;
        }

        if (authUser) {
          const { data: { session: currentSession } } = await supabase.auth.getSession();
          setSession(currentSession);
          await fetchUserData(authUser);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        setSession(newSession);

        if (event === 'SIGNED_IN' && newSession?.user) {
          await fetchUserData(newSession.user);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        } else if (event === 'USER_UPDATED' && newSession?.user) {
          await fetchUserData(newSession.user);
        } else if (event === 'TOKEN_REFRESHED' && newSession?.user) {
          // Handle token refresh - important for keeping mobile sessions alive
          await fetchUserData(newSession.user);
        }
      }
    );

    // Refresh session when page becomes visible (important for mobile)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSession();
      }
    };

    // Also refresh on focus (for when user switches back to the tab/app)
    const handleFocus = () => {
      refreshSession();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // Proactive session refresh every 10 minutes to prevent unexpected logouts
    const refreshInterval = setInterval(() => {
      refreshSession();
    }, 10 * 60 * 1000); // 10 minutes

    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      clearInterval(refreshInterval);
    };
  }, [supabase, fetchUserData, refreshSession]);

  const isAdmin = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{ user, session, isLoading, isAdmin, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
