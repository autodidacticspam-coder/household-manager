import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get('date');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let query = supabase
    .from('leave_requests')
    .select(`
      id,
      leave_type,
      status,
      start_date,
      end_date,
      selected_dates,
      reason,
      user:users!leave_requests_user_id_fkey(full_name)
    `)
    .eq('status', 'approved');

  if (date) {
    // Find leave requests that include this date
    query = query.or(`start_date.lte.${date},end_date.gte.${date}`);
  }

  const { data, error } = await query.order('start_date', { ascending: false }).limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter to only include entries where the date falls within selected_dates or date range
  const filtered = date ? data?.filter(entry => {
    if (entry.selected_dates && Array.isArray(entry.selected_dates)) {
      return entry.selected_dates.includes(date);
    }
    return entry.start_date <= date && entry.end_date >= date;
  }) : data;

  return NextResponse.json({
    date,
    count: filtered?.length || 0,
    entries: filtered
  });
}
