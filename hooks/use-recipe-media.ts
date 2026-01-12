'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { RecipeMediaInput, RecipeMediaType, RecipeStorageType } from '@/types/recipe';

export type { RecipeMediaInput };

const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_VIDEO_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
];

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

// Get thumbnail URL for video link
export function getVideoThumbnail(url: string): string | null {
  const platform = getVideoPlatform(url);
  if (platform === 'youtube') {
    const videoId = getYouTubeVideoId(url);
    if (videoId) {
      return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    }
  }
  return null;
}

// Determine media type from file
export function getMediaTypeFromFile(file: File): RecipeMediaType {
  return file.type.startsWith('video/') ? 'video' : 'image';
}

// Upload an image file
export function useUploadRecipeImage() {
  return useMutation({
    mutationFn: async (file: File): Promise<RecipeMediaInput> => {
      // Validate file type
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        throw new Error('Invalid image format. Allowed formats: JPG, PNG, WebP, GIF');
      }

      // Validate file size
      if (file.size > MAX_IMAGE_SIZE) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(1);
        throw new Error(`Image file is too large (${sizeMB} MB). Maximum size is 50 MB`);
      }

      // Get signed upload URL from API route
      const response = await fetch('/api/recipe-media-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          mediaType: 'image',
        }),
      });

      const urlResult = await response.json();

      if (!urlResult.success || !urlResult.data) {
        throw new Error(urlResult.error || 'Failed to get upload URL');
      }

      // Upload directly to Supabase using signed URL
      const uploadResponse = await fetch(urlResult.data.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload image');
      }

      return {
        mediaType: 'image',
        storageType: 'upload',
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

// Upload a video file
export function useUploadRecipeVideo() {
  return useMutation({
    mutationFn: async (file: File): Promise<RecipeMediaInput> => {
      // Validate file type
      if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
        throw new Error('Invalid video format. Allowed formats: MP4, WebM, MOV, AVI, MKV');
      }

      // Validate file size
      if (file.size > MAX_VIDEO_SIZE) {
        const sizeGB = (file.size / 1024 / 1024 / 1024).toFixed(1);
        throw new Error(`Video file is too large (${sizeGB} GB). Maximum size is 5 GB`);
      }

      // Get signed upload URL from API route
      const response = await fetch('/api/recipe-media-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          mediaType: 'video',
        }),
      });

      const urlResult = await response.json();

      if (!urlResult.success || !urlResult.data) {
        throw new Error(urlResult.error || 'Failed to get upload URL');
      }

      // Upload directly to Supabase using signed URL
      const uploadResponse = await fetch(urlResult.data.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload video');
      }

      return {
        mediaType: 'video',
        storageType: 'upload',
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

// Add a media link (YouTube, Vimeo, etc.)
export function useAddRecipeMediaLink() {
  return useMutation({
    mutationFn: async ({ url, title }: { url: string; title?: string }): Promise<RecipeMediaInput> => {
      try {
        new URL(url);
      } catch {
        throw new Error('Invalid URL');
      }

      // Determine if it's a video link
      const platform = getVideoPlatform(url);
      const mediaType: RecipeMediaType = platform ? 'video' : 'image';

      return {
        mediaType,
        storageType: 'link',
        url,
        title: title || url,
      };
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

// Delete recipe media from storage
export function useDeleteRecipeMedia() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, url, storageType }: { id: string; url: string; storageType: RecipeStorageType }) => {
      // Delete from storage if it's an upload
      if (storageType === 'upload') {
        try {
          const urlObj = new URL(url);
          if (urlObj.pathname.includes('/recipe-media/')) {
            const path = urlObj.pathname.split('/recipe-media/')[1];
            if (path) {
              await supabase.storage.from('recipe-media').remove([path]);
            }
          }
        } catch (e) {
          console.error('Error deleting media from storage:', e);
        }
      }

      // Delete from database
      const { error } = await supabase
        .from('recipe_media')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      queryClient.invalidateQueries({ queryKey: ['recipe'] });
      toast.success('Media removed');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
