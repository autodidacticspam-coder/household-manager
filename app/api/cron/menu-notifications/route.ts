import { NextRequest, NextResponse } from 'next/server';
import { dispatchMenuPushes } from '@/lib/notifications/menu-push';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json({ processed: await dispatchMenuPushes() });
  } catch {
    return NextResponse.json({ error: 'Menu notification delivery failed' }, { status: 500 });
  }
}
