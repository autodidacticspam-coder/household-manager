'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

export type AuthState = {
  error?: string;
  success?: boolean;
};

export async function login(
  prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const supabase = await createClient();

  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const redirectTo = formData.get('redirectTo') as string | null;

  if (!email || !password) {
    return { error: 'Email and password are required' };
  }

  const { error, data } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  // Get user role to determine redirect
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', data.user.id)
    .single();

  revalidatePath('/', 'layout');

  if (redirectTo) {
    redirect(redirectTo);
  } else if (userData?.role === 'admin') {
    redirect('/dashboard');
  } else {
    redirect('/my-tasks');
  }
}

export async function logout(): Promise<void> {
  const supabase = await createClient();

  // Use scope: 'global' to clear all sessions across devices
  await supabase.auth.signOut({ scope: 'global' });

  // Revalidate all cached data
  revalidatePath('/', 'layout');
  redirect('/login');
}

export async function forgotPassword(
  prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const supabase = await createClient();

  const email = formData.get('email') as string;

  if (!email) {
    return { error: 'Email is required' };
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

export async function resetPassword(
  prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const supabase = await createClient();

  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!password || !confirmPassword) {
    return { error: 'Password is required' };
  }

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match' };
  }

  if (password.length < 8) {
    return { error: 'Password must be at least 8 characters' };
  }

  const { error } = await supabase.auth.updateUser({
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect('/login?reset=success');
}

export async function updatePassword(
  prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const supabase = await createClient();

  const currentPassword = formData.get('currentPassword') as string;
  const newPassword = formData.get('newPassword') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: 'All fields are required' };
  }

  if (newPassword !== confirmPassword) {
    return { error: 'New passwords do not match' };
  }

  if (newPassword.length < 8) {
    return { error: 'Password must be at least 8 characters' };
  }

  // Verify current password by attempting to sign in
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return { error: 'Not authenticated' };
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (signInError) {
    return { error: 'Current password is incorrect' };
  }

  // Update password
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
