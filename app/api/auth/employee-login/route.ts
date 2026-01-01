import { NextResponse } from 'next/server';
import { getApiAdminClient, handleApiError } from '@/lib/supabase/api-helpers';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const adminClient = getApiAdminClient();

    // Check if user exists and is an employee
    const { data: userData, error: userError } = await adminClient
      .from('users')
      .select('id, role, email')
      .eq('email', email.toLowerCase())
      .single();

    if (userError || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (userData.role === 'admin') {
      return NextResponse.json({
        error: 'Admin users must use password login',
        isAdmin: true
      }, { status: 403 });
    }

    // Generate a magic link for the employee (without sending email)
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: userData.email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/my-tasks`,
      },
    });

    if (linkError || !linkData) {
      console.error('Error generating link:', linkError);
      return NextResponse.json({ error: 'Failed to generate login link' }, { status: 500 });
    }

    // Extract the token from the generated link
    // The link format is: {url}#access_token=...&refresh_token=...&...
    // Or for magic links: {url}?token=...&type=magiclink
    const actionLink = linkData.properties?.action_link;

    if (!actionLink) {
      return NextResponse.json({ error: 'Failed to generate login' }, { status: 500 });
    }

    // Return the action link for the client to use
    return NextResponse.json({
      success: true,
      actionLink,
      redirectTo: '/my-tasks'
    });

  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
