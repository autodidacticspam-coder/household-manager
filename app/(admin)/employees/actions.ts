'use server';

import { createClient, getAdminClient, type ActionState } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getTodayString } from '@/lib/date-utils';

// Re-exported from lib/supabase/server
export type { ActionState };

const createEmployeeSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().optional(),
  groupIds: z.array(z.string()).optional(),
});

export async function createEmployee(input: z.infer<typeof createEmployeeSchema>): Promise<ActionState> {
  const supabase = await createClient();
  const supabaseAdmin = getAdminClient();

  // Validate input
  const result = createEmployeeSchema.safeParse(input);
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  // Check if current user is admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userData?.role !== 'admin') {
    return { error: 'Only admins can create employees' };
  }

  const { email, password, fullName, phone, groupIds } = result.data;
  const normalizedEmail = email.toLowerCase();

  // Create auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
  });

  if (authError) {
    console.error('Auth user creation error:', authError);
    return { error: authError.message };
  }

  if (!authData.user) {
    return { error: 'Failed to create user' };
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
    console.error('User record creation error:', userError);
    // Rollback auth user
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return { error: 'Failed to create user record' };
  }

  // Create employee profile
  const { error: profileError } = await supabaseAdmin
    .from('employee_profiles')
    .insert({
      user_id: authData.user.id,
      phone: phone || null,
      hire_date: getTodayString(),
    });

  if (profileError) {
    console.error('Profile creation error:', profileError);
  }

  // Add to groups if specified
  if (groupIds && groupIds.length > 0) {
    const groupMemberships = groupIds.map((groupId) => ({
      user_id: authData.user.id,
      group_id: groupId,
    }));

    const { error: groupError } = await supabaseAdmin
      .from('employee_group_memberships')
      .insert(groupMemberships);

    if (groupError) {
      console.error('Group membership error:', groupError);
    }
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

  revalidatePath('/employees');

  return { success: true, data: { id: authData.user.id } };
}

const changePasswordSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

export async function changeUserPassword(input: z.infer<typeof changePasswordSchema>): Promise<ActionState> {
  const supabase = await createClient();
  const supabaseAdmin = getAdminClient();

  // Validate input
  const result = changePasswordSchema.safeParse(input);
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  // Check if current user is admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userData?.role !== 'admin') {
    return { error: 'Only admins can change passwords' };
  }

  const { userId, newPassword } = result.data;

  // Update user password using admin API
  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    userId,
    { password: newPassword }
  );

  if (updateError) {
    console.error('Password update error:', updateError);
    return { error: updateError.message };
  }

  return { success: true };
}
