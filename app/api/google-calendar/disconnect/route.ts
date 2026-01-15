import { NextResponse } from 'next/server';
import { getApiAuthUser, getApiAdminClient } from '@/lib/supabase/api-helpers';

const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export async function POST() {
  try {
    const user = await getApiAuthUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getApiAdminClient();

    // Get the token to revoke
    const { data: token } = await supabase
      .from('google_calendar_tokens')
      .select('access_token')
      .eq('user_id', user.id)
      .single();

    if (token?.access_token) {
      // Revoke the token with Google (best effort)
      try {
        await fetch(`${GOOGLE_REVOKE_URL}?token=${token.access_token}`, {
          method: 'POST',
        });
      } catch {
        // Ignore revoke errors - token might already be invalid
      }
    }

    // Delete token from database
    const { error } = await supabase
      .from('google_calendar_tokens')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting token:', error);
      return NextResponse.json(
        { error: 'Failed to disconnect' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Disconnect error:', error);
    return NextResponse.json(
      { error: 'Failed to disconnect' },
      { status: 500 }
    );
  }
}
