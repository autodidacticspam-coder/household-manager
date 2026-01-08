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
    const normalizedEmail = email.toLowerCase();

    // Check if email already exists
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      return NextResponse.json({ error: 'Failed to check existing users: ' + listError.message }, { status: 500 });
    }

    const emailExists = existingUsers?.users?.some(u => u.email?.toLowerCase() === normalizedEmail);
    if (emailExists) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 });
    }

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    // Create user record
    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        id: authData.user.id,
        email: normalizedEmail,
        full_name: fullName,
        phone: phone || null,
        role: 'employee',
      });

    if (userError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: 'Failed to create user record' }, { status: 500 });
    }

    // Create employee profile
    await supabaseAdmin
      .from('employee_profiles')
      .insert({
        user_id: authData.user.id,
        phone: phone || null,
        hire_date: getTodayString(),
      });

    // Add to groups if specified
    if (groupIds && groupIds.length > 0) {
      const groupMemberships = groupIds.map((groupId) => ({
        user_id: authData.user.id,
        group_id: groupId,
      }));

      await supabaseAdmin
        .from('employee_group_memberships')
        .insert(groupMemberships);
    }

    // Create leave balance for current year
    const currentYear = new Date().getFullYear();
    await supabaseAdmin
      .from('leave_balances')
      .insert({
        user_id: authData.user.id,
        year: currentYear,
        vacation_total: 15,
        vacation_used: 0,
        sick_total: 10,
        sick_used: 0,
      });

    return NextResponse.json({ success: true, data: { id: authData.user.id } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
