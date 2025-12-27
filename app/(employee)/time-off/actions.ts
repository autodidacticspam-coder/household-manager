'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  createLeaveRequestSchema,
  approveLeaveRequestSchema,
  denyLeaveRequestSchema,
  calculateTotalDays,
  type CreateLeaveRequestInput,
} from '@/lib/validators/leave';

export type ActionState = {
  error?: string;
  success?: boolean;
  data?: Record<string, unknown>;
};

export async function createLeaveRequest(input: CreateLeaveRequestInput): Promise<ActionState> {
  const supabase = await createClient();

  // Validate input
  const result = createLeaveRequestSchema.safeParse(input);
  if (!result.success) {
    return { error: result.error.issues[0].message };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  const data = result.data;
  const isFullDay = data.isFullDay ?? true;
  // For partial days, calculate based on hours; for full days, use selectedDaysCount from calendar
  const totalDays = isFullDay
    ? (data.selectedDaysCount || calculateTotalDays(data.startDate, data.endDate, true))
    : calculateTotalDays(data.startDate, data.endDate, false, data.startTime, data.endTime);

  // No balance limit checks - just track usage

  // Create leave request
  const { data: request, error } = await supabase
    .from('leave_requests')
    .insert({
      user_id: user.id,
      leave_type: data.leaveType,
      start_date: data.startDate,
      end_date: data.endDate,
      selected_dates: data.selectedDates || null,
      is_full_day: isFullDay,
      start_time: isFullDay ? null : data.startTime,
      end_time: isFullDay ? null : data.endTime,
      total_days: totalDays,
      reason: data.reason || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Leave request creation error:', error);
    return { error: 'Failed to create leave request' };
  }

  revalidatePath('/time-off');
  revalidatePath('/leave-requests');
  revalidatePath('/dashboard');

  return { success: true, data: { id: request.id } };
}

export async function approveLeaveRequest(
  requestId: string,
  adminNotes?: string
): Promise<ActionState> {
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
    return { error: 'Only admins can approve leave requests' };
  }

  // Get the leave request
  const { data: request, error: fetchError } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (fetchError || !request) {
    return { error: 'Leave request not found' };
  }

  if (request.status !== 'pending') {
    return { error: 'Leave request is not pending' };
  }

  // Update leave request
  const { error: updateError } = await supabase
    .from('leave_requests')
    .update({
      status: 'approved',
      admin_notes: adminNotes || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (updateError) {
    console.error('Leave request approval error:', updateError);
    return { error: 'Failed to approve leave request' };
  }

  // Update leave balance
  const requestYear = new Date(request.start_date).getFullYear();
  const { data: balance } = await supabase
    .from('leave_balances')
    .select('*')
    .eq('user_id', request.user_id)
    .eq('year', requestYear)
    .single();

  if (balance) {
    const updateField = request.leave_type === 'pto' ? 'pto_used' : 'sick_used';
    const currentUsed = parseFloat(balance[updateField]);
    const newUsed = currentUsed + parseFloat(request.total_days);

    await supabase
      .from('leave_balances')
      .update({ [updateField]: newUsed })
      .eq('id', balance.id);
  } else {
    // Create balance entry if it doesn't exist
    const ptoUsed = request.leave_type === 'pto' ? parseFloat(request.total_days) : 0;
    const sickUsed = request.leave_type === 'sick' ? parseFloat(request.total_days) : 0;

    await supabase
      .from('leave_balances')
      .insert({
        user_id: request.user_id,
        year: requestYear,
        pto_used: ptoUsed,
        sick_used: sickUsed,
      });
  }

  revalidatePath('/time-off');
  revalidatePath('/leave-requests');
  revalidatePath('/dashboard');

  return { success: true };
}

export async function denyLeaveRequest(
  requestId: string,
  adminNotes?: string
): Promise<ActionState> {
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
    return { error: 'Only admins can deny leave requests' };
  }

  // Get the leave request
  const { data: request, error: fetchError } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (fetchError || !request) {
    return { error: 'Leave request not found' };
  }

  if (request.status !== 'pending') {
    return { error: 'Leave request is not pending' };
  }

  // Update leave request
  const { error: updateError } = await supabase
    .from('leave_requests')
    .update({
      status: 'denied',
      admin_notes: adminNotes || null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (updateError) {
    console.error('Leave request denial error:', updateError);
    return { error: 'Failed to deny leave request' };
  }

  revalidatePath('/time-off');
  revalidatePath('/leave-requests');
  revalidatePath('/dashboard');

  return { success: true };
}

export async function cancelLeaveRequest(requestId: string): Promise<ActionState> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Not authenticated' };
  }

  // Get the leave request
  const { data: request, error: fetchError } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (fetchError || !request) {
    return { error: 'Leave request not found' };
  }

  // Check if user owns this request or is admin
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const isAdmin = userData?.role === 'admin';
  const isOwner = request.user_id === user.id;

  if (!isAdmin && !isOwner) {
    return { error: 'You can only cancel your own leave requests' };
  }

  // Non-admins can only cancel pending requests
  if (!isAdmin && request.status !== 'pending') {
    return { error: 'Only pending leave requests can be cancelled' };
  }

  // If the request was approved, restore the leave balance
  if (request.status === 'approved') {
    const requestYear = new Date(request.start_date).getFullYear();
    const { data: balance } = await supabase
      .from('leave_balances')
      .select('*')
      .eq('user_id', request.user_id)
      .eq('year', requestYear)
      .single();

    if (balance) {
      const updateField = request.leave_type === 'pto' ? 'pto_used' : 'sick_used';
      const currentUsed = parseFloat(balance[updateField]);
      const newUsed = Math.max(0, currentUsed - parseFloat(request.total_days));

      await supabase
        .from('leave_balances')
        .update({ [updateField]: newUsed })
        .eq('id', balance.id);
    }
  }

  // Delete the request
  const { error: deleteError } = await supabase
    .from('leave_requests')
    .delete()
    .eq('id', requestId);

  if (deleteError) {
    console.error('Leave request cancellation error:', deleteError);
    return { error: 'Failed to cancel leave request' };
  }

  revalidatePath('/time-off');
  revalidatePath('/leave-requests');
  revalidatePath('/dashboard');

  return { success: true };
}
