import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            // Ensure proper cookie settings for mobile browsers
            supabaseResponse.cookies.set(name, value, {
              ...options,
              path: '/',
              sameSite: 'lax',
              secure: process.env.NODE_ENV === 'production',
              // Extend max age to 7 days for better mobile persistence
              maxAge: options?.maxAge || 60 * 60 * 24 * 7,
            });
          });
        },
      },
    }
  );

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (error) {
    // Auth might fail during certain server operations (e.g., revalidation)
    console.warn('Middleware auth check failed:', error);
  }

  const pathname = request.nextUrl.pathname;

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/forgot-password', '/reset-password'];
  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

  // If not authenticated and trying to access protected route
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(url);
  }

  // If authenticated and trying to access login page, redirect to dashboard
  if (user && isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Redirect root to dashboard (client will handle role-based UI)
  if (user && pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api).*)',
  ],
};
