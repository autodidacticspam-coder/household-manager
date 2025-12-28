import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

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
              // Ensure proper cookie settings for mobile browsers
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
