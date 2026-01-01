import { NextResponse } from 'next/server';
import { createClient as createAdminClientBase } from '@supabase/supabase-js';

export async function GET() {
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
  };

  // Check environment variables
  results.hasSupabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
  results.hasServiceRoleKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  results.supabaseUrlPrefix = process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...';

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({
      ...results,
      error: 'Missing environment variables',
    });
  }

  try {
    // Create admin client
    const supabaseAdmin = createAdminClientBase(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    results.adminClientCreated = true;

    // Test storage bucket access
    const { data: buckets, error: bucketsError } = await supabaseAdmin.storage.listBuckets();

    if (bucketsError) {
      results.bucketsError = bucketsError.message;
    } else {
      results.buckets = buckets?.map(b => b.name);
      results.hasTaskVideosBucket = buckets?.some(b => b.name === 'task-videos');
    }

    // Test creating a signed upload URL
    const testFileName = `test-${Date.now()}.mp4`;
    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
      .from('task-videos')
      .createSignedUploadUrl(testFileName);

    if (signedUrlError) {
      results.signedUrlError = signedUrlError.message;
    } else {
      results.signedUrlCreated = true;
      results.signedUrlLength = signedUrlData?.signedUrl?.length;
    }

    // Test getting public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from('task-videos')
      .getPublicUrl(testFileName);

    results.publicUrl = publicUrlData?.publicUrl?.substring(0, 50) + '...';

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({
      ...results,
      error: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined,
    });
  }
}
