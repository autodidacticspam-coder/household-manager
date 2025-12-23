import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Admin client for creating users
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
    // Check if current user is admin
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: currentUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (currentUser?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { email, fullName, password, phone, groupIds, dateOfBirth, hireDate } = body;

    if (!email || !fullName || !password) {
      return NextResponse.json(
        { error: 'Email, full name, and password are required' },
        { status: 400 }
      );
    }

    const adminClient = getAdminClient();

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
  } catch (error) {
    console.error('Create employee error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
