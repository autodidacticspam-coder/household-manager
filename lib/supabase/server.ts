import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createAdminClientBase } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export type ActionState = {
  error?: string;
  success?: boolean;
  data?: Record<string, unknown>;
};

/**
 * Create admin client for bypassing RLS
 */
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('Missing Supabase env vars:', {
      hasUrl: !!url,
      hasKey: !!key,
      keyLength: key?.length
    });
    throw new Error('Supabase configuration is missing. Please check environment variables.');
  }

  return createAdminClientBase(url, key);
}

/**
 * Get authenticated user or return error
 */
export async function requireAuth(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' as const, user: null };
  }
  return { error: null, user };
}

/**
 * Require admin role or return error
 */
export async function requireAdminRole(supabase: Awaited<ReturnType<typeof createClient>>, adminClient: ReturnType<typeof getAdminClient>) {
  const authResult = await requireAuth(supabase);
  if (authResult.error) {
    return { error: authResult.error, user: null, userData: null };
  }

  const { data: userData } = await adminClient
    .from('users')
    .select('role, preferred_locale')
    .eq('id', authResult.user.id)
    .single();

  if (userData?.role !== 'admin') {
    return { error: 'Only admins can perform this action' as const, user: authResult.user, userData: null };
  }

  return { error: null, user: authResult.user, userData };
}

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({
              name,
              value,
              ...options,
              path: '/',
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
              maxAge: options?.maxAge || 60 * 60 * 24 * 7, // 7 days default
            });
          } catch {
            // Handle cookies in Server Components
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({
              name,
              value: '',
              ...options,
              path: '/',
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
              maxAge: 0,
            });
          } catch {
            // Handle cookies in Server Components
          }
        },
      },
    }
  );
}
