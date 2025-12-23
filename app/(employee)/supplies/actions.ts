'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export type ActionState = {
  error?: string;
  success?: boolean;
  data?: Record<string, unknown>;
};

const createSupplyRequestSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional(),
  productUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
});

export async function createSupplyRequest(input: z.infer<typeof createSupplyRequestSchema>): Promise<ActionState> {
  const supabase = await createClient();

  const result = createSupplyRequestSchema.safeParse(input);
  if (!result.success) {
    return { error: result.error.errors[0].message };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  const { title, description, productUrl } = result.data;

  const { data: request, error } = await supabase
    .from('supply_requests')
    .insert({
      user_id: user.id,
      title,
      description: description || null,
      product_url: productUrl || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Supply request creation error:', error);
    return { error: 'Failed to create supply request' };
  }

  revalidatePath('/supplies');
  revalidatePath('/supply-requests');

  return { success: true, data: { id: request.id } };
}

export async function cancelSupplyRequest(requestId: string): Promise<ActionState> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Check if request exists and belongs to user
  const { data: request, error: fetchError } = await supabase
    .from('supply_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (fetchError || !request) {
    return { error: 'Supply request not found' };
  }

  if (request.user_id !== user.id) {
    return { error: 'You can only cancel your own requests' };
  }

  if (request.status !== 'pending') {
    return { error: 'Only pending requests can be cancelled' };
  }

  const { error: deleteError } = await supabase
    .from('supply_requests')
    .delete()
    .eq('id', requestId);

  if (deleteError) {
    console.error('Supply request cancellation error:', deleteError);
    return { error: 'Failed to cancel supply request' };
  }

  revalidatePath('/supplies');

  return { success: true };
}

export async function approveSupplyRequest(requestId: string, adminNotes?: string): Promise<ActionState> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Check if user is admin
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userData?.role !== 'admin') {
    return { error: 'Only admins can approve supply requests' };
  }

  const { error: updateError } = await supabase
    .from('supply_requests')
    .update({
      status: 'approved',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      admin_notes: adminNotes || null,
    })
    .eq('id', requestId);

  if (updateError) {
    console.error('Supply request approval error:', updateError);
    return { error: 'Failed to approve supply request' };
  }

  revalidatePath('/supplies');
  revalidatePath('/supply-requests');

  return { success: true };
}

export async function rejectSupplyRequest(requestId: string, adminNotes?: string): Promise<ActionState> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Check if user is admin
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userData?.role !== 'admin') {
    return { error: 'Only admins can reject supply requests' };
  }

  const { error: updateError } = await supabase
    .from('supply_requests')
    .update({
      status: 'rejected',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      admin_notes: adminNotes || null,
    })
    .eq('id', requestId);

  if (updateError) {
    console.error('Supply request rejection error:', updateError);
    return { error: 'Failed to reject supply request' };
  }

  revalidatePath('/supplies');
  revalidatePath('/supply-requests');

  return { success: true };
}
