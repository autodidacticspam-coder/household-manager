import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Admin client for managing users
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

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

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

    // Prevent deleting yourself
    if (user.id === id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    const adminClient = getAdminClient();

    // Delete user data in correct order (due to foreign keys)
    // 1. Delete group memberships
    await adminClient
      .from('employee_group_memberships')
      .delete()
      .eq('user_id', id);

    // 2. Delete employee profile
    await adminClient
      .from('employee_profiles')
      .delete()
      .eq('user_id', id);

    // 3. Delete leave balances
    await adminClient
      .from('leave_balances')
      .delete()
      .eq('user_id', id);

    // 4. Delete leave requests
    await adminClient
      .from('leave_requests')
      .delete()
      .eq('user_id', id);

    // 5. Delete task assignments
    await adminClient
      .from('task_assignments')
      .delete()
      .eq('target_user_id', id);

    // 6. Delete supply requests
    await adminClient
      .from('supply_requests')
      .delete()
      .eq('user_id', id);

    // 7. Delete child logs
    await adminClient
      .from('child_logs')
      .delete()
      .eq('logged_by', id);

    // 8. Delete user record
    const { error: userDeleteError } = await adminClient
      .from('users')
      .delete()
      .eq('id', id);

    if (userDeleteError) {
      console.error('Error deleting user record:', userDeleteError);
      return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
    }

    // 9. Delete auth user
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(id);

    if (authDeleteError) {
      console.error('Error deleting auth user:', authDeleteError);
      // User record is already deleted, so just log the error
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete employee error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

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
    const { fullName, phone, role, groupIds, dateOfBirth, hireDate, emergencyContact, notes, importantDates } = body;

    const adminClient = getAdminClient();

    // Update user record
    const updateData: Record<string, unknown> = {};
    if (fullName !== undefined) updateData.full_name = fullName;
    if (phone !== undefined) updateData.phone = phone;
    if (role !== undefined) updateData.role = role;

    if (Object.keys(updateData).length > 0) {
      const { error: userError } = await adminClient
        .from('users')
        .update(updateData)
        .eq('id', id);

      if (userError) {
        console.error('Error updating user:', userError);
        return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
      }
    }

    // Update or create employee profile
    const profileData: Record<string, unknown> = {};
    if (dateOfBirth !== undefined) profileData.date_of_birth = dateOfBirth || null;
    if (hireDate !== undefined) profileData.hire_date = hireDate || null;
    if (emergencyContact !== undefined) profileData.emergency_contact = emergencyContact || null;
    if (notes !== undefined) profileData.notes = notes || null;
    if (importantDates !== undefined) profileData.important_dates = importantDates;

    if (Object.keys(profileData).length > 0) {
      // Check if profile exists
      const { data: existingProfile } = await adminClient
        .from('employee_profiles')
        .select('id')
        .eq('user_id', id)
        .single();

      if (existingProfile) {
        const { error: profileError } = await adminClient
          .from('employee_profiles')
          .update(profileData)
          .eq('user_id', id);

        if (profileError) {
          console.error('Error updating profile:', profileError);
        }
      } else {
        const { error: profileError } = await adminClient
          .from('employee_profiles')
          .insert({ user_id: id, ...profileData });

        if (profileError) {
          console.error('Error creating profile:', profileError);
        }
      }
    }

    // Update group memberships if provided
    if (groupIds !== undefined) {
      // Delete existing memberships
      await adminClient
        .from('employee_group_memberships')
        .delete()
        .eq('user_id', id);

      // Add new memberships
      if (groupIds.length > 0) {
        const { error: membershipError } = await adminClient
          .from('employee_group_memberships')
          .insert(
            groupIds.map((groupId: string) => ({
              user_id: id,
              group_id: groupId,
            }))
          );

        if (membershipError) {
          console.error('Error adding group memberships:', membershipError);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update employee error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
