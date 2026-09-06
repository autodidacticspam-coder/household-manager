import { NextRequest, NextResponse } from 'next/server';
import { saveLeave } from '@/lib/leave-service';
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const result = await saveLeave('deny', { ...body, id });
  return NextResponse.json(result, { status: result.status || 200 });
}
