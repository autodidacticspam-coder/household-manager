import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// POST - Register push token for current user (uses service role to bypass RLS)
export async function POST(request: NextRequest) {
  try {
    const { token, platform = 'ios' } = await request.json();

    if (!token) {
      return NextResponse.json({ error: 'token is required' }, { status: 400 });
    }

    // Get current user from session
    const supabaseAuth = await createServerClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      console.error('[PUSH_REGISTER] Auth error:', authError);
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    console.log('[PUSH_REGISTER] Registering token for user:', user.id);
    console.log('[PUSH_REGISTER] Token preview:', token.slice(0, 20) + '...');

    // Use service role to bypass RLS
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabaseAdmin
      .from('user_push_tokens')
      .upsert({
        user_id: user.id,
        token,
        platform,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,token',
      });

    if (error) {
      console.error('[PUSH_REGISTER] Database error:', error);
      return NextResponse.json({ error: 'Failed to save token: ' + error.message }, { status: 500 });
    }

    console.log('[PUSH_REGISTER] Token saved successfully!');
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[PUSH_REGISTER] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
