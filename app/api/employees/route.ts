import { NextResponse } from 'next/server';
import { getApiAdminClient, requireApiAdminRole, handleApiError } from '@/lib/supabase/api-helpers';

export async function POST(request: Request) {
  try {
    await requireApiAdminRole();

    const body = await request.json();
    const { email, fullName, password, phone, groupIds, dateOfBirth, hireDate } = body;

    if (!email || !fullName || !password) {
      return NextResponse.json(
        { error: 'Email, full name, and password are required' },
        { status: 400 }
      );
    }

    const adminClient = getApiAdminClient();

    // Create auth user
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      console.error('Error creating auth user:', authError);
      return NextResponse.json(
        { error: authError?.message || 'Failed to create user' },
        { status: 400 }
      );
    }

    const userId = authData.user.id;

    // Create user record
    const { error: userError } = await adminClient
      .from('users')
      .insert({
        id: userId,
        email: email.toLowerCase(),
        full_name: fullName,
        phone: phone || null,
        role: 'employee',
      });

    if (userError) {
      // Cleanup: delete auth user if user record creation fails
      await adminClient.auth.admin.deleteUser(userId);
      console.error('Error creating user record:', userError);
      return NextResponse.json({ error: 'Failed to create user record' }, { status: 500 });
    }

    // Create employee profile
    const { error: profileError } = await adminClient
      .from('employee_profiles')
      .insert({
        user_id: userId,
        date_of_birth: dateOfBirth || null,
        hire_date: hireDate || null,
      });

    if (profileError) {
      console.error('Error creating employee profile:', profileError);
    }

    // Add to groups if specified
    if (groupIds && groupIds.length > 0) {
      const { error: membershipError } = await adminClient
        .from('employee_group_memberships')
        .insert(
          groupIds.map((groupId: string) => ({
            user_id: userId,
            group_id: groupId,
          }))
        );

      if (membershipError) {
        console.error('Error adding group memberships:', membershipError);
      }
    }

    return NextResponse.json({ success: true, userId });
  } catch (err) {
    const { error, status } = handleApiError(err);
    return NextResponse.json({ error }, { status });
  }
}
