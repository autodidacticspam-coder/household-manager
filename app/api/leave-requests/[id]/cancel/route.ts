import { NextRequest, NextResponse } from 'next/server';
import { saveLeave } from '@/lib/leave-service';
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = {};
  const result = await saveLeave('cancel', { ...body, id });
  return NextResponse.json(result, { status: result.status || 200 });
}
