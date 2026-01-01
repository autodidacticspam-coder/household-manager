'use server';

import { getAdminClient } from '@/lib/supabase/server';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB (Supabase free tier limit)
const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
];

export type UploadVideoResult = {
  success: boolean;
  error?: string;
  data?: {
    url: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  };
};

export async function uploadTaskVideo(formData: FormData): Promise<UploadVideoResult> {
  const file = formData.get('file') as File;

  if (!file) {
    return { success: false, error: 'No file provided' };
  }

  // Validate file type
  if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
    return { success: false, error: 'Invalid video format. Allowed formats: MP4, WebM, MOV, AVI, MKV' };
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return { success: false, error: 'Video file is too large. Maximum size is 50 MB' };
  }

  const supabaseAdmin = getAdminClient();

  // Create a unique filename
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

  // Convert File to ArrayBuffer then to Buffer for server-side upload
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Upload to Supabase Storage using admin client
  const { error: uploadError } = await supabaseAdmin.storage
    .from('task-videos')
    .upload(fileName, buffer, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error('Video upload error:', uploadError);
    return { success: false, error: 'Failed to upload video' };
  }

  // Get the public URL
  const { data: { publicUrl } } = supabaseAdmin.storage
    .from('task-videos')
    .getPublicUrl(fileName);

  return {
    success: true,
    data: {
      url: publicUrl,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    },
  };
}
