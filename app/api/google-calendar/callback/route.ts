import { NextRequest, NextResponse } from 'next/server';
import { getApiAdminClient, getApiAuthUser } from '@/lib/supabase/api-helpers';
import { DEFAULT_SYNC_FILTERS } from '@/lib/google-calendar/calendar-service';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Always redirect to the production URL (not the deployment-specific URL)
  const appUrl = 'https://household-manager-two.vercel.app';
  const settingsUrl = `${appUrl}/settings`;

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error);
    return NextResponse.redirect(`${settingsUrl}?gcal_error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return NextResponse.redirect(`${settingsUrl}?gcal_error=missing_params`);
  }

  try {
    // The tokens must be stored under the signed-in user - never under an id
    // embedded in the attacker-controllable state parameter.
    const user = await getApiAuthUser();
    if (!user) {
      return NextResponse.redirect(`${settingsUrl}?gcal_error=not_signed_in`);
    }
    const userId = user.id;

    // CSRF check: the state must match the nonce cookie set when this
    // browser session started the OAuth flow.
    const stateCookie = request.cookies.get('gcal_oauth_state')?.value;
    if (!stateCookie || stateCookie !== state) {
      return NextResponse.redirect(`${settingsUrl}?gcal_error=invalid_state`);
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || '',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return NextResponse.redirect(`${settingsUrl}?gcal_error=token_exchange_failed`);
    }

    const tokenData = await tokenResponse.json();

    // Get user's email for display
    const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
    });

    let email = '';
    if (userInfoResponse.ok) {
      const userInfo = await userInfoResponse.json();
      email = userInfo.email || '';
    }

    // Calculate token expiry
    const tokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000);

    // Store tokens in database
    const supabase = getApiAdminClient();

    // Reconnecting must not clobber the user's chosen sync filters or
    // calendar - only apply defaults on a first-time connect.
    const { data: existing } = await supabase
      .from('google_calendar_tokens')
      .select('calendar_id, sync_filters')
      .eq('user_id', userId)
      .maybeSingle();

    // Upsert token record
    const { error: dbError } = await supabase
      .from('google_calendar_tokens')
      .upsert({
        user_id: userId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expiry: tokenExpiry.toISOString(),
        calendar_id: existing?.calendar_id || 'primary',
        sync_filters: existing?.sync_filters ?? DEFAULT_SYNC_FILTERS,
        google_email: email,
      }, {
        onConflict: 'user_id',
      });

    if (dbError) {
      console.error('Database error:', dbError);
      return NextResponse.redirect(`${settingsUrl}?gcal_error=database_error`);
    }

    // Success! Redirect back to settings and clear the one-time state nonce
    const response = NextResponse.redirect(`${settingsUrl}?gcal_connected=true`);
    response.cookies.delete('gcal_oauth_state');
    return response;
  } catch (err) {
    console.error('Callback error:', err);
    return NextResponse.redirect(`${settingsUrl}?gcal_error=unknown_error`);
  }
}
