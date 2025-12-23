import { createClient } from '@/lib/supabase/server';
import type { LeaveRequest, LeaveBalance } from '@/types';

export type LeaveFilters = {
  userId?: string;
  status?: 'pending' | 'approved' | 'denied';
  leaveType?: 'pto' | 'sick';
  startDate?: string;
  endDate?: string;
};

export async function getLeaveRequests(filters?: LeaveFilters): Promise<LeaveRequest[]> {
  const supabase = await createClient();

  let query = supabase
    .from('leave_requests')
    .select(`
      *,
      user:users!leave_requests_user_id_fkey(id, full_name, avatar_url, email),
      reviewed_by_user:users!leave_requests_reviewed_by_fkey(id, full_name)
    `)
    .order('created_at', { ascending: false });

  if (filters?.userId) {
    query = query.eq('user_id', filters.userId);
  }

  if (filters?.status) {
    query = query.eq('status', filters.status);
  }

  if (filters?.leaveType) {
    query = query.eq('leave_type', filters.leaveType);
  }

  if (filters?.startDate) {
    query = query.gte('start_date', filters.startDate);
  }

  if (filters?.endDate) {
    query = query.lte('end_date', filters.endDate);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map(transformLeaveRequest);
}

export async function getLeaveRequestById(id: string): Promise<LeaveRequest | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('leave_requests')
    .select(`
      *,
      user:users!leave_requests_user_id_fkey(id, full_name, avatar_url, email),
      reviewed_by_user:users!leave_requests_reviewed_by_fkey(id, full_name)
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return transformLeaveRequest(data);
}

export async function getMyLeaveRequests(userId: string): Promise<LeaveRequest[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('leave_requests')
    .select(`
      *,
      user:users!leave_requests_user_id_fkey(id, full_name, avatar_url, email),
      reviewed_by_user:users!leave_requests_reviewed_by_fkey(id, full_name)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(transformLeaveRequest);
}

export async function getPendingLeaveRequests(): Promise<LeaveRequest[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('leave_requests')
    .select(`
      *,
      user:users!leave_requests_user_id_fkey(id, full_name, avatar_url, email),
      reviewed_by_user:users!leave_requests_reviewed_by_fkey(id, full_name)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data || []).map(transformLeaveRequest);
}

export async function getLeaveBalance(userId: string, year?: number): Promise<LeaveBalance | null> {
  const supabase = await createClient();
  const targetYear = year || new Date().getFullYear();

  const { data, error } = await supabase
    .from('leave_balances')
    .select('*')
    .eq('user_id', userId)
    .eq('year', targetYear)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return {
    id: data.id,
    userId: data.user_id,
    year: data.year,
    ptoTotal: parseFloat(data.pto_total),
    ptoUsed: parseFloat(data.pto_used),
    sickTotal: parseFloat(data.sick_total),
    sickUsed: parseFloat(data.sick_used),
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function getUpcomingLeave(): Promise<LeaveRequest[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('leave_requests')
    .select(`
      *,
      user:users!leave_requests_user_id_fkey(id, full_name, avatar_url, email),
      reviewed_by_user:users!leave_requests_reviewed_by_fkey(id, full_name)
    `)
    .eq('status', 'approved')
    .gte('start_date', today)
    .order('start_date', { ascending: true })
    .limit(10);

  if (error) throw error;

  return (data || []).map(transformLeaveRequest);
}

export async function getCurrentlyOnLeave(): Promise<LeaveRequest[]> {
  const supabase = await createClient();
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('leave_requests')
    .select(`
      *,
      user:users!leave_requests_user_id_fkey(id, full_name, avatar_url, email),
      reviewed_by_user:users!leave_requests_reviewed_by_fkey(id, full_name)
    `)
    .eq('status', 'approved')
    .lte('start_date', today)
    .gte('end_date', today)
    .order('end_date', { ascending: true });

  if (error) throw error;

  return (data || []).map(transformLeaveRequest);
}

function transformLeaveRequest(row: Record<string, unknown>): LeaveRequest {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    leaveType: row.leave_type as 'pto' | 'sick',
    status: row.status as 'pending' | 'approved' | 'denied',
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    isFullDay: row.is_full_day as boolean,
    startTime: row.start_time as string | null,
    endTime: row.end_time as string | null,
    totalDays: parseFloat(row.total_days as string) || 0,
    reason: row.reason as string | null,
    adminNotes: row.admin_notes as string | null,
    reviewedBy: row.reviewed_by as string | null,
    reviewedAt: row.reviewed_at as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    user: row.user as { id: string; fullName: string; avatarUrl: string | null; email: string } | undefined,
    reviewedByUser: row.reviewed_by_user as { id: string; fullName: string } | undefined,
  };
}
