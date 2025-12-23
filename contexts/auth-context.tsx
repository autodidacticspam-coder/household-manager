'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
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

  const refreshUser = useCallback(async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      await fetchUserData(authUser);
    }
  }, [supabase, fetchUserData]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        setSession(currentSession);

        if (currentSession?.user) {
          await fetchUserData(currentSession.user);
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
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, fetchUserData]);

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
