'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { TaskTemplate, TemplateAssignment, TemplateVideo, TaskVideoType } from '@/types';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

export type VideoInput = {
  videoType: TaskVideoType;
  url: string;
  title?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
};

type CreateTemplateInput = {
  name: string;
  title: string;
  description?: string | null;
  categoryId?: string | null;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  isAllDay?: boolean;
  defaultTime?: string | null;
  isActivity?: boolean;
  startTime?: string | null;
  endTime?: string | null;
  repeatDays?: number[] | null;
  repeatInterval?: 'weekly' | 'biweekly' | 'monthly' | null;
  defaultAssignments?: TemplateAssignment[];
  defaultViewers?: TemplateAssignment[];
  videos?: VideoInput[];
};

function transformTemplateVideo(row: Record<string, unknown>): TemplateVideo {
  return {
    id: row.id as string,
    templateId: row.template_id as string,
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

function transformTemplate(row: Record<string, unknown>): TaskTemplate {
  const category = row.category as { id: string; name: string; color: string; icon: string | null } | null;
  const videosRaw = row.videos as Record<string, unknown>[] | null;

  return {
    id: row.id as string,
    name: row.name as string,
    title: row.title as string,
    description: row.description as string | null,
    categoryId: row.category_id as string | null,
    priority: row.priority as TaskTemplate['priority'],
    isAllDay: row.is_all_day as boolean,
    defaultTime: row.default_time as string | null,
    isActivity: row.is_activity as boolean,
    startTime: row.start_time as string | null,
    endTime: row.end_time as string | null,
    repeatDays: row.repeat_days as number[] | null,
    repeatInterval: row.repeat_interval as TaskTemplate['repeatInterval'],
    defaultAssignments: (row.default_assignments as TemplateAssignment[]) || [],
    defaultViewers: (row.default_viewers as TemplateAssignment[]) || [],
    createdBy: row.created_by as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    category: category ? {
      id: category.id,
      name: category.name,
      color: category.color,
      icon: category.icon,
    } : null,
    videos: videosRaw ? videosRaw.map(transformTemplateVideo) : [],
  };
}

export function useTaskTemplates() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['task-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_templates')
        .select(`
          *,
          category:task_categories(id, name, color, icon),
          videos:template_videos(*)
        `)
        .order('name', { ascending: true });

      if (error) throw error;
      return (data || []).map(transformTemplate);
    },
  });
}

export function useTaskTemplate(id: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ['task-template', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_templates')
        .select(`
          *,
          category:task_categories(id, name, color, icon),
          videos:template_videos(*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return transformTemplate(data);
    },
    enabled: !!id,
  });
}

export function useCreateTaskTemplate() {
  const queryClient = useQueryClient();
  const supabase = createClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (input: CreateTemplateInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('task_templates')
        .insert({
          name: input.name,
          title: input.title,
          description: input.description || null,
          category_id: input.categoryId || null,
          priority: input.priority || 'medium',
          is_all_day: input.isAllDay || false,
          default_time: input.defaultTime || null,
          is_activity: input.isActivity || false,
          start_time: input.startTime || null,
          end_time: input.endTime || null,
          repeat_days: input.repeatDays || null,
          repeat_interval: input.repeatInterval || null,
          default_assignments: input.defaultAssignments || [],
          default_viewers: input.defaultViewers || [],
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      // Insert videos if provided
      if (input.videos && input.videos.length > 0) {
        const videoInserts = input.videos.map(video => ({
          template_id: data.id,
          video_type: video.videoType,
          url: video.url,
          title: video.title || null,
          file_name: video.fileName || null,
          file_size: video.fileSize || null,
          mime_type: video.mimeType || null,
          created_by: user.id,
        }));

        const { error: videoError } = await supabase
          .from('template_videos')
          .insert(videoInserts);

        if (videoError) {
          console.error('Error inserting template videos:', videoError);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-templates'] });
      toast.success(t('templates.created'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateTaskTemplate() {
  const queryClient = useQueryClient();
  const supabase = createClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async ({ id, ...input }: CreateTemplateInput & { id: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('task_templates')
        .update({
          name: input.name,
          title: input.title,
          description: input.description || null,
          category_id: input.categoryId || null,
          priority: input.priority || 'medium',
          is_all_day: input.isAllDay || false,
          default_time: input.defaultTime || null,
          is_activity: input.isActivity || false,
          start_time: input.startTime || null,
          end_time: input.endTime || null,
          repeat_days: input.repeatDays || null,
          repeat_interval: input.repeatInterval || null,
          default_assignments: input.defaultAssignments || [],
          default_viewers: input.defaultViewers || [],
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Insert new videos if provided
      if (input.videos && input.videos.length > 0) {
        const videoInserts = input.videos.map(video => ({
          template_id: id,
          video_type: video.videoType,
          url: video.url,
          title: video.title || null,
          file_name: video.fileName || null,
          file_size: video.fileSize || null,
          mime_type: video.mimeType || null,
          created_by: user.id,
        }));

        const { error: videoError } = await supabase
          .from('template_videos')
          .insert(videoInserts);

        if (videoError) {
          console.error('Error inserting template videos:', videoError);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-templates'] });
      toast.success(t('templates.updated'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteTaskTemplate() {
  const queryClient = useQueryClient();
  const supabase = createClient();
  const t = useTranslations();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('task_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-templates'] });
      toast.success(t('templates.deleted'));
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteTemplateVideo() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ id, url, videoType }: { id: string; url: string; videoType: 'upload' | 'link' }) => {
      // Delete from storage if it's an uploaded video
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

      // Delete from database
      const { error } = await supabase
        .from('template_videos')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-templates'] });
      toast.success('Video removed');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
