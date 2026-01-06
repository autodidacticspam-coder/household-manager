import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireApiAdminRole, handleApiError } from '@/lib/supabase/api-helpers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET - List all push tokens (admin only, for debugging)
export async function GET(_request: NextRequest) {
  try {
    await requireApiAdminRole();

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: tokens, error } = await supabase
      .from('user_push_tokens')
      .select(`
        id,
        user_id,
        token,
        platform,
        created_at,
        updated_at,
        users (
          full_name,
          email
        )
      `)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching push tokens:', error);
      return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 });
    }

    // Type for Supabase user join result (returns array or single object)
    type UserJoin = { full_name: string | null; email: string | null } | null;

    // Helper to extract user from Supabase join (handles array or single object)
    function extractUser(rawUser: unknown): UserJoin {
      if (!rawUser) return null;
      if (Array.isArray(rawUser)) return rawUser[0] as UserJoin;
      return rawUser as UserJoin;
    }

    return NextResponse.json({
      count: tokens?.length || 0,
      tokens: tokens?.map(t => {
        const user = extractUser(t.users);
        return {
          id: t.id,
          userId: t.user_id,
          userName: user?.full_name || 'Unknown',
          email: user?.email || 'Unknown',
          tokenPreview: t.token.slice(0, 20) + '...',
          platform: t.platform,
          updatedAt: t.updated_at,
        };
      })
    });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}

// POST - Manually register a push token
export async function POST(request: NextRequest) {
  try {
    const { userId, token, platform = 'ios' } = await request.json();

    if (!userId || !token) {
      return NextResponse.json({ error: 'userId and token are required' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabase
      .from('user_push_tokens')
      .upsert({
        user_id: userId,
        token,
        platform,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,token',
      });

    if (error) {
      console.error('Error saving push token:', error);
      return NextResponse.json({ error: 'Failed to save token' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
