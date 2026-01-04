import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireApiAdminRole, handleApiError } from '@/lib/supabase/api-helpers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET - List all push tokens (admin only, for debugging)
export async function GET(request: NextRequest) {
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

    return NextResponse.json({
      count: tokens?.length || 0,
      tokens: tokens?.map(t => ({
        id: t.id,
        userId: t.user_id,
        userName: (t.users as any)?.full_name || 'Unknown',
        email: (t.users as any)?.email || 'Unknown',
        tokenPreview: t.token.slice(0, 20) + '...',
        platform: t.platform,
        updatedAt: t.updated_at,
      }))
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
