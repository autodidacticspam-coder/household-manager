import { NextResponse } from 'next/server';
import { getApiAdminClient, handleApiError } from '@/lib/supabase/api-helpers';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const adminClient = getApiAdminClient();

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

  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
