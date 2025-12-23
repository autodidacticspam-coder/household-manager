import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const SUPPORTED_LOCALES = ['en', 'es', 'zh'];

export async function POST(request: NextRequest) {
  try {
    const { locale } = await request.json();

    if (!locale || !SUPPORTED_LOCALES.includes(locale)) {
      return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
    }

    const cookieStore = await cookies();

    // Set the locale cookie
    cookieStore.set('locale', locale, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: 'lax',
    });

    return NextResponse.json({ success: true, locale });
  } catch (error) {
    console.error('Error setting locale:', error);
    return NextResponse.json({ error: 'Failed to set locale' }, { status: 500 });
  }
}
