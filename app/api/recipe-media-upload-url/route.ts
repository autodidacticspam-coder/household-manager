import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { fileName, mediaType } = await request.json();

    if (!fileName) {
      return NextResponse.json(
        { success: false, error: 'fileName is required' },
        { status: 400 }
      );
    }

    // Create admin client
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Create a unique filename with timestamp
    const fileExt = fileName.split('.').pop() || 'jpg';
    const folder = mediaType === 'video' ? 'videos' : 'images';
    const uniqueFileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    // Create a signed URL for upload
    const { data, error } = await supabaseAdmin.storage
      .from('recipe-media')
      .createSignedUploadUrl(uniqueFileName);

    if (error) {
      console.error('Error creating signed URL:', error);
      return NextResponse.json(
        { success: false, error: `Storage error: ${error.message}` },
        { status: 500 }
      );
    }

    if (!data?.signedUrl) {
      return NextResponse.json(
        { success: false, error: 'No signed URL returned' },
        { status: 500 }
      );
    }

    // Get the public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from('recipe-media')
      .getPublicUrl(uniqueFileName);

    return NextResponse.json({
      success: true,
      data: {
        signedUrl: data.signedUrl,
        path: uniqueFileName,
        publicUrl: publicUrlData.publicUrl,
      },
    });
  } catch (err) {
    console.error('Recipe media upload URL error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
