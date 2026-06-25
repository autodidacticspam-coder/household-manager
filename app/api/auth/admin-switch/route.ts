import { NextResponse } from 'next/server';
import { ApiError, getApiAdminClient, handleApiError, requireApiAdminRole } from '@/lib/supabase/api-helpers';

export async function POST(request: Request) {
  try {
    const { user: adminUser } = await requireApiAdminRole();
    const { targetUserId } = await request.json();

    if (!targetUserId || typeof targetUserId !== 'string') {
      throw new ApiError('Target user is required', 400);
    }

    if (targetUserId === adminUser.id) {
      throw new ApiError('You are already using this account', 400);
    }

    const adminClient = getApiAdminClient();
    const { data: targetUser, error: targetError } = await adminClient
      .from('users')
      .select('id, email, full_name, role')
      .eq('id', targetUserId)
      .single();

    if (targetError || !targetUser) {
      throw new ApiError('Target user not found', 404);
    }

    const redirectTo = targetUser.role === 'admin' ? '/dashboard' : '/my-tasks';

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: targetUser.email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}${redirectTo}`,
      },
    });

    const actionLink = linkData?.properties?.action_link;
    if (linkError || !actionLink) {
      throw new ApiError('Failed to create account switch token', 500);
    }

    return NextResponse.json({
      actionLink,
      redirectTo,
      targetUser: {
        id: targetUser.id,
        email: targetUser.email,
        fullName: targetUser.full_name,
        role: targetUser.role,
      },
    });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
