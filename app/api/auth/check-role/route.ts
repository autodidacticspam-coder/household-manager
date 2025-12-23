import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Admin client for bypassing RLS
function getAdminClient() {
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

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const adminClient = getAdminClient();

    // Check if user exists and get their role
    const { data: userData, error: userError } = await adminClient
      .from('users')
      .select('id, role, full_name')
      .eq('email', email.toLowerCase())
      .single();

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found', exists: false }, { status: 404 });
    }

    return NextResponse.json({
      exists: true,
      role: userData.role,
      fullName: userData.full_name,
    });

  } catch (error) {
    console.error('Check role error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
