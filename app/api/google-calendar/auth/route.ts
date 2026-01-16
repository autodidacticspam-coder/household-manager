import { NextResponse } from 'next/server';
import { getApiAuthUser } from '@/lib/supabase/api-helpers';
import crypto from 'crypto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email',
];

export async function GET() {
  try {
    const user = await getApiAuthUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Generate state parameter for CSRF protection
    // Format: base64(userId:randomBytes)
    const randomBytes = crypto.randomBytes(16).toString('hex');
    const state = Buffer.from(`${user.id}:${randomBytes}`).toString('base64');

    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      redirect_uri: process.env.GOOGLE_REDIRECT_URI || '',
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent', // Force consent to get refresh token
      state,
    });

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;
    console.log('Generated auth URL with scopes:', SCOPES);

    return NextResponse.json({ url: authUrl });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate authorization URL' },
      { status: 500 }
    );
  }
}
