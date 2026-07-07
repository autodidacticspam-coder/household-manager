import { NextResponse } from 'next/server';
import { getApiAuthUser } from '@/lib/supabase/api-helpers';
import crypto from 'crypto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
// Request only calendar scope to test
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
];

export async function GET() {
  try {
    const user = await getApiAuthUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Generate state parameter for CSRF protection. The same value is stored
    // in an HttpOnly cookie so the callback can verify the flow was started
    // by this browser session — the callback must never trust the state's
    // contents on its own.
    const state = crypto.randomBytes(32).toString('hex');

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || '',
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;

    const response = NextResponse.json({ url: authUrl });
    response.cookies.set('gcal_oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600, // 10 minutes to complete the consent screen
    });
    return response;
  } catch (error) {
    console.error('Error generating auth URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate authorization URL' },
      { status: 500 }
    );
  }
}
