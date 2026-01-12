import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { User } from '@supabase/supabase-js';

/**
 * Get admin Supabase client that bypasses RLS
 * Use this for server-side operations that need full database access
 */
export function getApiAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

/**
 * Get authenticated user from request cookies
 * Returns the user if authenticated, null otherwise
 */
export async function getApiAuthUser(): Promise<User | null> {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Check if user is authenticated and has admin role
 * Returns { user, userData } if admin, throws error otherwise
 */
export async function requireApiAdminRole(): Promise<{
  user: User;
  userData: { role: string; preferred_locale?: string };
}> {
  const user = await getApiAuthUser();

  if (!user) {
    throw new ApiError('Not authenticated', 401);
  }

  const adminClient = getApiAdminClient();
  const { data: userData, error } = await adminClient
    .from('users')
    .select('role, preferred_locale')
    .eq('id', user.id)
    .single();

  if (error || !userData || userData.role !== 'admin') {
    throw new ApiError('Only admins can perform this action', 403);
  }

  return { user, userData };
}

/**
 * Check if user is authenticated and has admin role OR is in chef group
 * Returns { user, userData } if admin/chef, throws error otherwise
 */
export async function requireApiAdminOrChefRole(): Promise<{
  user: User;
  userData: { role: string; preferred_locale?: string };
}> {
  const user = await getApiAuthUser();

  if (!user) {
    throw new ApiError('Not authenticated', 401);
  }

  const adminClient = getApiAdminClient();

  // Check if admin
  const { data: userData, error } = await adminClient
    .from('users')
    .select('role, preferred_locale')
    .eq('id', user.id)
    .single();

  if (error || !userData) {
    throw new ApiError('User not found', 404);
  }

  if (userData.role === 'admin') {
    return { user, userData };
  }

  // Check if in chef group
  const { data: membership } = await adminClient
    .from('employee_group_memberships')
    .select(`
      group:employee_groups!inner(name)
    `)
    .eq('user_id', user.id);

  const isChef = membership?.some((m) => {
    const group = m.group as { name: string }[] | { name: string } | null;
    if (Array.isArray(group)) {
      return group.some(g => g.name?.toLowerCase() === 'chef');
    }
    return (group as { name?: string } | null)?.name?.toLowerCase() === 'chef';
  });

  if (!isChef) {
    throw new ApiError('Only admins and chefs can perform this action', 403);
  }

  return { user, userData };
}

/**
 * Custom error class for API errors with status code
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Handle API errors and return appropriate response
 */
export function handleApiError(err: unknown): { error: string; status: number } {
  if (err instanceof ApiError) {
    return { error: err.message, status: err.statusCode };
  }

  console.error('API Error:', err);
  return {
    error: err instanceof Error ? err.message : 'An unexpected error occurred',
    status: 500,
  };
}
