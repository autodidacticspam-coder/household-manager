'use server';

import { createClient, getAdminClient, type ActionState } from '@/lib/supabase/server';
import { z } from 'zod';

// Re-exported from lib/supabase/server
export type { ActionState };

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
    return { error: updateError.message };
  }

  return { success: true };
}
