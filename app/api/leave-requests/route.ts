import { NextRequest, NextResponse } from 'next/server';
import { saveLeave } from '@/lib/leave-service';
export async function POST(request: NextRequest) {
  const result = await saveLeave('create', await request.json().catch(() => null));
  return NextResponse.json(result, { status: result.status || 200 });
}
