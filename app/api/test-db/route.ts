import { NextResponse } from 'next/server';
import { getApiAdminClient } from '@/lib/supabase/api-helpers';
import { format, subDays, addDays } from 'date-fns';

// Temporary debug endpoint - remove after fixing sync issue
export async function GET() {
  const supabase = getApiAdminClient();

  // Calculate date range same as sync service
  const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const endDate = format(addDays(new Date(), 90), 'yyyy-MM-dd');

  // Test 1: Count all tasks
  const { count: taskCount, error: countError } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true });

  // Test 2: Get sample tasks
  const { data: sampleTasks, error: sampleError } = await supabase
    .from('tasks')
    .select('id, title, due_date')
    .limit(5);

  // Test 2b: Get tasks in date range (same query as sync service)
  const { data: tasksInRange, error: rangeError } = await supabase
    .from('tasks')
    .select('id, title, due_date')
    .gte('due_date', startDate)
    .lte('due_date', endDate)
    .order('due_date')
    .limit(10);

  // Test 3: Count google_calendar_tokens and get full data
  const { count: tokenCount, error: tokenError } = await supabase
    .from('google_calendar_tokens')
    .select('*', { count: 'exact', head: true });

  // Test 4: Get actual token data with sync_filters
  const { data: tokenData, error: tokenDataError } = await supabase
    .from('google_calendar_tokens')
    .select('user_id, sync_filters, google_email, calendar_id')
    .limit(5);

  // Test 4: Check service role key presence
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const keyPrefix = process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 10);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    version: 'v2',
    dateRange: { start: startDate, end: endDate },
    tasks: {
      count: taskCount,
      error: countError?.message || null,
      sample: sampleTasks?.map(t => ({ id: t.id, title: t.title, due_date: t.due_date })) || [],
      sampleError: sampleError?.message || null,
      inRange: tasksInRange?.map(t => ({ id: t.id, title: t.title, due_date: t.due_date })) || [],
      inRangeCount: tasksInRange?.length || 0,
      rangeError: rangeError?.message || null,
    },
    tokens: {
      count: tokenCount,
      error: tokenError?.message || null,
      data: tokenData?.map(t => ({
        user_id: t.user_id,
        sync_filters: t.sync_filters,
        google_email: t.google_email,
        calendar_id: t.calendar_id,
      })) || [],
      dataError: tokenDataError?.message || null,
    },
    env: {
      hasServiceKey,
      keyPrefix: keyPrefix ? `${keyPrefix}...` : null,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30),
    },
  });
}
