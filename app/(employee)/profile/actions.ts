'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export type ActionState = {
  error?: string;
  success?: boolean;
};

// Admin client for bypassing RLS
function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const importantDateSchema = z.object({
  label: z.string().min(1, 'Label is required').max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
});

const updateProfileSchema = z.object({
  fullName: z.string().min(1, 'Name is required').max(255),
  phone: z.string().max(20).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  emergencyContact: z.string().max(255).optional().nullable(),
  importantDates: z.array(importantDateSchema).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export async function updateProfile(input: UpdateProfileInput): Promise<ActionState> {
  const supabase = await createClient();
  const supabaseAdmin = getAdminClient();

  // Validate input
  const result = updateProfileSchema.safeParse(input);
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  const { fullName, phone, avatarUrl, dateOfBirth, emergencyContact, importantDates } = result.data;

  // Update users table
  const { error: userError } = await supabaseAdmin
    .from('users')
    .update({
      full_name: fullName,
      phone: phone || null,
      avatar_url: avatarUrl || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (userError) {
    console.error('User update error:', userError);
    return { error: 'Failed to update profile' };
  }

  // Check if employee profile exists
  const { data: existingProfile } = await supabaseAdmin
    .from('employee_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  const profileData = {
    date_of_birth: dateOfBirth || null,
    emergency_contact: emergencyContact || null,
    important_dates: importantDates || [],
    updated_at: new Date().toISOString(),
  };

  if (existingProfile) {
    // Update existing profile
    const { error: profileError } = await supabaseAdmin
      .from('employee_profiles')
      .update(profileData)
      .eq('user_id', user.id);

    if (profileError) {
      console.error('Profile update error:', profileError);
      return { error: 'Failed to update profile details' };
    }
  } else {
    // Create new profile
    const { error: profileError } = await supabaseAdmin
      .from('employee_profiles')
      .insert({
        user_id: user.id,
        ...profileData,
      });

    if (profileError) {
      console.error('Profile create error:', profileError);
      return { error: 'Failed to create profile details' };
    }
  }

  revalidatePath('/profile');
  revalidatePath('/dashboard');

  return { success: true };
}

export async function getProfile() {
  const supabase = await createClient();
  const supabaseAdmin = getAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  // Get user data
  const { data: userData } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!userData) {
    return null;
  }

  // Get employee profile
  const { data: profileData } = await supabaseAdmin
    .from('employee_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  return {
    id: userData.id,
    email: userData.email,
    fullName: userData.full_name,
    role: userData.role,
    avatarUrl: userData.avatar_url,
    phone: userData.phone,
    preferredLocale: userData.preferred_locale,
    dateOfBirth: profileData?.date_of_birth || null,
    hireDate: profileData?.hire_date || null,
    emergencyContact: profileData?.emergency_contact || null,
    notes: profileData?.notes || null,
    importantDates: (profileData?.important_dates as { label: string; date: string }[]) || [],
  };
}
