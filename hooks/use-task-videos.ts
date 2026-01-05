'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { TaskVideo, TaskVideoType, VideoInput } from '@/types/task';

// Re-export VideoInput for consumers that import from this file
export type { VideoInput };

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB
const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
];

// Helper to detect video platform from URL
export function getVideoPlatform(url: string): 'youtube' | 'vimeo' | 'other' | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
      return 'youtube';
    }
    if (urlObj.hostname.includes('vimeo.com')) {
      return 'vimeo';
    }
    return 'other';
  } catch {
    return null;
  }
}

// Helper to extract YouTube video ID
export function getYouTubeVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('youtu.be')) {
      return urlObj.pathname.slice(1);
    }
    if (urlObj.hostname.includes('youtube.com')) {
      return urlObj.searchParams.get('v');
    }
    return null;
  } catch {
    return null;
  }
}

// Helper to extract Vimeo video ID
export function getVimeoVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const match = urlObj.pathname.match(/\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Get thumbnail URL for video
export function getVideoThumbnail(url: string, videoType: TaskVideoType): string | null {
  if (videoType === 'upload') {
    return null;
  }

  const platform = getVideoPlatform(url);
  if (platform === 'youtube') {
    const videoId = getYouTubeVideoId(url);
    if (videoId) {
      return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    }
  }
  if (platform === 'vimeo') {
    return null;
  }
  return null;
}

// Upload a video file using signed URL (bypasses RLS)
export function useUploadTaskVideo() {
  return useMutation({
    mutationFn: async (file: File): Promise<VideoInput> => {
      // Validate file type
      if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
        throw new Error('Invalid video format. Allowed formats: MP4, WebM, MOV, AVI, MKV');
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        const sizeGB = (file.size / 1024 / 1024 / 1024).toFixed(1);
        throw new Error(`Video file is too large (${sizeGB} GB). Maximum size is 5 GB`);
      }

      // Get signed upload URL from API route
      const response = await fetch('/api/video-upload-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
        }),
      });

      const urlResult = await response.json();

      if (!urlResult.success || !urlResult.data) {
        throw new Error(urlResult.error || 'Failed to get upload URL');
      }

      // Upload directly to Supabase using signed URL
      const uploadResponse = await fetch(urlResult.data.signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload video');
      }

      return {
        videoType: 'upload' as const,
        url: urlResult.data.publicUrl,
        title: file.name.replace(/\.[^/.]+$/, ''),
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
      };
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Add a video link
export function useAddVideoLink() {
  return useMutation({
    mutationFn: async ({ url, title }: { url: string; title?: string }): Promise<VideoInput> => {
      try {
        new URL(url);
      } catch {
        throw new Error('Invalid URL');
      }

      return {
        videoType: 'link',
        url,
        title: title || url,
      };
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Delete a video from storage (for uploaded videos)
export function useDeleteTaskVideo() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, url, videoType }: { id: string; url: string; videoType: TaskVideoType }) => {
      if (videoType === 'upload') {
        try {
          const urlObj = new URL(url);
          if (urlObj.pathname.includes('/task-videos/')) {
            const path = urlObj.pathname.split('/task-videos/')[1];
            if (path) {
              await supabase.storage.from('task-videos').remove([path]);
            }
          }
        } catch (e) {
          console.error('Error deleting video from storage:', e);
        }
      }

      const { error } = await supabase
        .from('task_videos')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['calendar'] });
      toast.success('Video removed');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Transform database row to TaskVideo
export function transformTaskVideo(row: Record<string, unknown>): TaskVideo {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    videoType: row.video_type as TaskVideoType,
    url: row.url as string,
    title: row.title as string | null,
    fileName: row.file_name as string | null,
    fileSize: row.file_size as number | null,
    mimeType: row.mime_type as string | null,
    createdAt: row.created_at as string,
    createdBy: row.created_by as string | null,
  };
}
