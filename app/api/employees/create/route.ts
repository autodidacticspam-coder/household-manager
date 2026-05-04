import { createClient, getAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getTodayString } from '@/lib/date-utils';

const createEmployeeSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().optional(),
  groupIds: z.array(z.string()).optional(),
});

async function cleanupCreatedEmployee(
  supabaseAdmin: ReturnType<typeof getAdminClient>,
  userId: string
) {
  await supabaseAdmin.from('employee_group_memberships').delete().eq('user_id', userId);
  await supabaseAdmin.from('employee_profiles').delete().eq('user_id', userId);
  await supabaseAdmin.from('leave_balances').delete().eq('user_id', userId);
  await supabaseAdmin.from('users').delete().eq('id', userId);
  await supabaseAdmin.auth.admin.deleteUser(userId);
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json();
    const supabase = await createClient();
    const supabaseAdmin = getAdminClient();

    // Validate input
    const result = createEmployeeSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 });
    }

    // Check if current user is admin
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can create employees' }, { status: 403 });
    }

    const { email, password, fullName, phone, groupIds } = result.data;
    const normalizedEmail = email.trim().toLowerCase();

    const { data: existingUser, error: existingUserError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (existingUserError) {
      return NextResponse.json({ error: 'Failed to check existing users' }, { status: 500 });
    }
    if (existingUser) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 });
    }

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        fullName,
        name: fullName,
        phone: phone || null,
        role: 'employee',
      },
      app_metadata: {
        role: 'employee',
      },
    });

    if (authError) {
      console.error('Error creating auth user:', authError);
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    const userId = authData.user.id;

    try {
      // Upsert because production may have an auth.users trigger that creates this row.
      const { error: userError } = await supabaseAdmin
        .from('users')
        .upsert({
          id: userId,
          email: normalizedEmail,
          full_name: fullName,
          phone: phone || null,
          role: 'employee',
        }, {
          onConflict: 'id',
        });

      if (userError) {
        throw new Error(`Failed to create user record: ${userError.message}`);
      }

      const { error: profileError } = await supabaseAdmin
        .from('employee_profiles')
        .upsert({
          user_id: userId,
          phone: phone || null,
          hire_date: getTodayString(),
        }, {
          onConflict: 'user_id',
        });

      if (profileError) {
        throw new Error(`Failed to create employee profile: ${profileError.message}`);
      }

      if (groupIds && groupIds.length > 0) {
        const groupMemberships = groupIds.map((groupId) => ({
          user_id: userId,
          group_id: groupId,
        }));

        const { error: membershipError } = await supabaseAdmin
          .from('employee_group_memberships')
          .insert(groupMemberships);

        if (membershipError) {
          throw new Error(`Failed to add employee groups: ${membershipError.message}`);
        }
      }

      const currentYear = new Date().getFullYear();
      const { error: balanceError } = await supabaseAdmin
        .from('leave_balances')
        .upsert({
          user_id: userId,
          year: currentYear,
          vacation_total: 15,
          vacation_used: 0,
          sick_total: 10,
          sick_used: 0,
        }, {
          onConflict: 'user_id,year',
        });

      if (balanceError) {
        throw new Error(`Failed to create leave balance: ${balanceError.message}`);
      }
    } catch (setupError) {
      console.error('Error creating employee records:', setupError);
      await cleanupCreatedEmployee(supabaseAdmin, userId);
      return NextResponse.json(
        { error: setupError instanceof Error ? setupError.message : 'Failed to create employee records' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: { id: userId } });
  } catch (error) {
    console.error('Unexpected employee creation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
