'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { TaskTemplate, TemplateAssignment, TaskCategory } from '@/types';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

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
  isRecurring?: boolean;
  recurrenceRule?: string | null;
  defaultAssignments?: TemplateAssignment[];
};

function transformTemplate(row: Record<string, unknown>): TaskTemplate {
  const category = row.category as { id: string; name: string; color: string; icon: string | null } | null;

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
    isRecurring: row.is_recurring as boolean,
    recurrenceRule: row.recurrence_rule as string | null,
    defaultAssignments: (row.default_assignments as TemplateAssignment[]) || [],
    createdBy: row.created_by as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    category: category ? {
      id: category.id,
      name: category.name,
      color: category.color,
      icon: category.icon,
    } : null,
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
          category:task_categories(id, name, color, icon)
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
          category:task_categories(id, name, color, icon)
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
          is_recurring: input.isRecurring || false,
          recurrence_rule: input.recurrenceRule || null,
          default_assignments: input.defaultAssignments || [],
          created_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
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
          is_recurring: input.isRecurring || false,
          recurrence_rule: input.recurrenceRule || null,
          default_assignments: input.defaultAssignments || [],
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
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
