import { NextResponse } from 'next/server';
import { getApiAdminClient } from '@/lib/supabase/api-helpers';

// Temporary debug endpoint - remove after fixing sync issue
export async function GET() {
  const supabase = getApiAdminClient();

  // Test 1: Count all tasks
  const { count: taskCount, error: countError } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true });

  // Test 2: Get sample tasks
  const { data: sampleTasks, error: sampleError } = await supabase
    .from('tasks')
    .select('id, title, due_date')
    .limit(5);

  // Test 3: Count google_calendar_tokens
  const { count: tokenCount, error: tokenError } = await supabase
    .from('google_calendar_tokens')
    .select('*', { count: 'exact', head: true });

  // Test 4: Check service role key presence
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const keyPrefix = process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 10);

  return NextResponse.json({
    tasks: {
      count: taskCount,
      error: countError?.message || null,
      sample: sampleTasks?.map(t => ({ id: t.id, title: t.title, due_date: t.due_date })) || [],
      sampleError: sampleError?.message || null,
    },
    tokens: {
      count: tokenCount,
      error: tokenError?.message || null,
    },
    env: {
      hasServiceKey,
      keyPrefix: keyPrefix ? `${keyPrefix}...` : null,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30),
    },
  });
}
