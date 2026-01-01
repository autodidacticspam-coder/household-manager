'use server';

import { getAdminClient } from '@/lib/supabase/server';

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
    const supabaseAdmin = getAdminClient();

    // Create a unique filename
    const fileExt = fileName.split('.').pop();
    const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    // Create a signed URL for upload
    const { data, error } = await supabaseAdmin.storage
      .from('task-videos')
      .createSignedUploadUrl(uniqueFileName);

    if (error) {
      console.error('Error creating signed URL:', error);
      return { success: false, error: 'Failed to create upload URL' };
    }

    // Get the public URL
    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('task-videos')
      .getPublicUrl(uniqueFileName);

    return {
      success: true,
      data: {
        signedUrl: data.signedUrl,
        path: uniqueFileName,
        publicUrl,
      },
    };
  } catch (err) {
    console.error('Video upload URL error:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
