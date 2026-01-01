'use server';

import { createClient, getAdminClient } from '@/lib/supabase/server';

export type SignedUrlResult = {
  success: boolean;
  error?: string;
  data?: {
    signedUrl: string;
    path: string;
    publicUrl: string;
  };
};

export async function getVideoUploadUrl(fileName: string, mimeType: string): Promise<SignedUrlResult> {
  try {
    // Verify user is authenticated
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('Auth error in video upload:', authError);
      return { success: false, error: 'Not authenticated' };
    }

    const supabaseAdmin = getAdminClient();

    // Create a unique filename (organize by user)
    const fileExt = fileName.split('.').pop() || 'mp4';
    const uniqueFileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    // Create a signed URL for upload
    const { data, error } = await supabaseAdmin.storage
      .from('task-videos')
      .createSignedUploadUrl(uniqueFileName);

    if (error) {
      console.error('Error creating signed URL:', error);
      return { success: false, error: `Storage error: ${error.message}` };
    }

    if (!data?.signedUrl) {
      return { success: false, error: 'No signed URL returned' };
    }

    // Get the public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from('task-videos')
      .getPublicUrl(uniqueFileName);

    return {
      success: true,
      data: {
        signedUrl: data.signedUrl,
        path: uniqueFileName,
        publicUrl: publicUrlData.publicUrl,
      },
    };
  } catch (err) {
    console.error('Video upload URL error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'An unexpected error occurred' };
  }
}
