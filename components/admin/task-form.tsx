'use client';

import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { getTodayString } from '@/lib/date-utils';
import { format, addYears } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, X, Plus, Users, User, CalendarClock, UserPlus, Repeat, Save, FolderOpen, Trash2, Folder } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';
import { useTaskCategories, useEmployeeGroups, useEmployees, useCreateTask, useUpdateTask } from '@/hooks/use-tasks';
import { useTaskTemplates, useCreateTaskTemplate, useUpdateTaskTemplate, useDeleteTaskTemplate } from '@/hooks/use-task-templates';
import { createTaskSchema, type CreateTaskInput, type TaskAssignmentInput, type TaskViewerInput } from '@/lib/validators/task';
import type { TaskWithRelations, TaskTemplate, TemplateAssignment } from '@/types';
import { Eye } from 'lucide-react';
import { TaskVideosSection } from '@/components/admin/task-videos-section';
import type { VideoInput } from '@/hooks/use-task-videos';

type TaskFormProps = {
  task?: TaskWithRelations;
  template?: TaskTemplate | null;
  onSuccess?: () => void;
};

export function TaskForm({ task, template: initialTemplate, onSuccess }: TaskFormProps) {
  const t = useTranslations();
  const router = useRouter();

  const { data: categories, isLoading: categoriesLoading } = useTaskCategories();
  const { data: groups, isLoading: groupsLoading } = useEmployeeGroups();
  const { data: employees, isLoading: employeesLoading } = useEmployees();
  const { data: templates } = useTaskTemplates();

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const createTemplate = useCreateTaskTemplate();
  const updateTemplate = useUpdateTaskTemplate();
  const deleteTemplate = useDeleteTaskTemplate();

  // Template dialog state
  const [saveTemplateDialogOpen, setSaveTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [overwriteTemplateId, setOverwriteTemplateId] = useState<string | null>(null);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const [loadedTemplate, setLoadedTemplate] = useState<TaskTemplate | null>(initialTemplate || null);

  // Initialize assignments from task or template
  const getInitialAssignments = (): TaskAssignmentInput[] => {
    if (task?.assignments) {
      return task.assignments.map((a) => ({
        targetType: a.targetType,
        targetUserId: a.targetUserId,
        targetGroupId: a.targetGroupId,
      }));
    }
    if (loadedTemplate?.defaultAssignments) {
      return loadedTemplate.defaultAssignments.map((a) => ({
        targetType: a.targetType,
        targetUserId: a.targetUserId || undefined,
        targetGroupId: a.targetGroupId || undefined,
      }));
    }
    return [];
  };

  const [assignments, setAssignments] = useState<TaskAssignmentInput[]>(getInitialAssignments());

  // Initialize viewers from task or template
  const getInitialViewers = (): TaskViewerInput[] => {
    if (task?.viewers) {
      return task.viewers.map((v) => ({
        targetType: v.targetType,
        targetUserId: v.targetUserId,
        targetGroupId: v.targetGroupId,
      }));
    }
    if (loadedTemplate?.defaultViewers) {
      return loadedTemplate.defaultViewers.map((v) => ({
        targetType: v.targetType,
        targetUserId: v.targetUserId || undefined,
        targetGroupId: v.targetGroupId || undefined,
      }));
    }
    return [];
  };

  const [viewers, setViewers] = useState<TaskViewerInput[]>(getInitialViewers());

  // Video state
  const getInitialVideos = (): VideoInput[] => {
    if (task?.videos) {
      return task.videos.map(v => ({
        videoType: v.videoType,
        url: v.url,
        title: v.title || undefined,
      }));
    }
    if (loadedTemplate?.videos) {
      return loadedTemplate.videos.map(v => ({
        videoType: v.videoType,
        url: v.url,
        title: v.title || undefined,
      }));
    }
    return [];
  };

  const [pendingVideos, setPendingVideos] = useState<VideoInput[]>([]);
  const [existingVideosToKeep, setExistingVideosToKeep] = useState<VideoInput[]>(getInitialVideos());

  const [newAssignmentType, setNewAssignmentType] = useState<'user' | 'group' | 'all' | 'all_admins'>('user');
  const [newAssignmentTarget, setNewAssignmentTarget] = useState<string>('');
  const [multiSelectOpen, setMultiSelectOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  // Viewer state
  const [newViewerType, setNewViewerType] = useState<'user' | 'group' | 'all' | 'all_admins'>('user');
  const [newViewerTarget, setNewViewerTarget] = useState<string>('');
  const [viewerMultiSelectOpen, setViewerMultiSelectOpen] = useState(false);
  const [selectedViewerUsers, setSelectedViewerUsers] = useState<string[]>([]);

  // Repeat system state
  const [repeatEnabled, setRepeatEnabled] = useState(
    () => !!(loadedTemplate?.repeatDays && loadedTemplate.repeatDays.length > 0)
  );
  const [selectedDays, setSelectedDays] = useState<number[]>(
    () => loadedTemplate?.repeatDays || []
  );
  const [repeatInterval, setRepeatInterval] = useState<'weekly' | 'biweekly' | 'monthly'>(
    () => (loadedTemplate?.repeatInterval as 'weekly' | 'biweekly' | 'monthly') || 'weekly'
  );
  const [repeatEndDate, setRepeatEndDate] = useState<string>(
    () => format(addYears(new Date(), 1), 'yyyy-MM-dd')
  );

  // Time helpers
  const parse24To12 = (time24: string | null | undefined): { time: string; ampm: 'AM' | 'PM' } => {
    if (!time24) return { time: '', ampm: 'AM' };
    const [hours, minutes] = time24.slice(0, 5).split(':').map(Number);
    const ampm: 'AM' | 'PM' = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return { time: `${hours12}:${minutes.toString().padStart(2, '0')}`, ampm };
  };

  const to24Hour = (time12: string, ampm: 'AM' | 'PM'): string => {
    if (!time12) return '';
    const [hourStr, minStr] = time12.split(':');
    let hour = parseInt(hourStr, 10) || 0;
    const min = minStr || '00';
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, '0')}:${min.padStart(2, '0')}`;
  };

  // Time state
  const dueTimeInit = parse24To12(task?.dueTime || loadedTemplate?.defaultTime);
  const startTimeInit = parse24To12(task?.startTime || loadedTemplate?.startTime);
  const endTimeInit = parse24To12(task?.endTime || loadedTemplate?.endTime);

  const [dueTimeInput, setDueTimeInput] = useState(dueTimeInit.time);
  const [dueTimeAmPm, setDueTimeAmPm] = useState<'AM' | 'PM'>(dueTimeInit.ampm);
  const [startTimeInput, setStartTimeInput] = useState(startTimeInit.time);
  const [startTimeAmPm, setStartTimeAmPm] = useState<'AM' | 'PM'>(startTimeInit.ampm);
  const [endTimeInput, setEndTimeInput] = useState(endTimeInit.time);
  const [endTimeAmPm, setEndTimeAmPm] = useState<'AM' | 'PM'>(endTimeInit.ampm);

  const DAYS_OF_WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const today = useMemo(() => getTodayString(), []);

  const form = useForm<CreateTaskInput>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      title: task?.title || loadedTemplate?.title || '',
      description: task?.description || loadedTemplate?.description || '',
      categoryId: task?.categoryId || loadedTemplate?.categoryId || undefined,
      priority: task?.priority || loadedTemplate?.priority || 'medium',
      dueDate: task?.dueDate || today,
      dueTime: task?.dueTime || loadedTemplate?.defaultTime || undefined,
      isAllDay: task?.isAllDay ?? loadedTemplate?.isAllDay ?? false,
      isActivity: task?.isActivity ?? loadedTemplate?.isActivity ?? false,
      startTime: task?.startTime || loadedTemplate?.startTime || undefined,
      endTime: task?.endTime || loadedTemplate?.endTime || undefined,
      syncToCalendar: task?.syncToCalendar ?? false,
      assignments: assignments,
    },
  });

  // Group templates by category
  const templatesByCategory = useMemo(() => {
    if (!templates) return {};
    const grouped: Record<string, TaskTemplate[]> = { uncategorized: [] };

    templates.forEach(template => {
      const categoryName = template.category?.name || 'uncategorized';
      if (!grouped[categoryName]) {
        grouped[categoryName] = [];
      }
      grouped[categoryName].push(template);
    });

    return grouped;
  }, [templates]);

  // Load template into form
  const handleLoadTemplate = (template: TaskTemplate) => {
    setLoadedTemplate(template);

    // Update form values
    form.reset({
      title: template.title,
      description: template.description || '',
      categoryId: template.categoryId || undefined,
      priority: template.priority,
      dueDate: today,
      isAllDay: template.isAllDay,
      isActivity: template.isActivity,
      syncToCalendar: false,
    });

    // Update assignments
    const newAssignments: TaskAssignmentInput[] = template.defaultAssignments?.map(a => ({
      targetType: a.targetType,
      targetUserId: a.targetUserId || undefined,
      targetGroupId: a.targetGroupId || undefined,
    })) || [];
    setAssignments(newAssignments);

    // Update viewers
    const newViewers: TaskViewerInput[] = template.defaultViewers?.map(v => ({
      targetType: v.targetType,
      targetUserId: v.targetUserId || undefined,
      targetGroupId: v.targetGroupId || undefined,
    })) || [];
    setViewers(newViewers);

    // Update time
    const timeInit = parse24To12(template.defaultTime);
    setDueTimeInput(timeInit.time);
    setDueTimeAmPm(timeInit.ampm);

    const startInit = parse24To12(template.startTime);
    setStartTimeInput(startInit.time);
    setStartTimeAmPm(startInit.ampm);

    const endInit = parse24To12(template.endTime);
    setEndTimeInput(endInit.time);
    setEndTimeAmPm(endInit.ampm);

    // Update repeat settings
    setRepeatEnabled(!!(template.repeatDays && template.repeatDays.length > 0));
    setSelectedDays(template.repeatDays || []);
    setRepeatInterval((template.repeatInterval as 'weekly' | 'biweekly' | 'monthly') || 'weekly');

    // Update videos
    const newVideos: VideoInput[] = template.videos?.map(v => ({
      videoType: v.videoType,
      url: v.url,
      title: v.title || undefined,
    })) || [];
    setExistingVideosToKeep(newVideos);
    setPendingVideos([]);

    toast.success(`Template "${template.name}" loaded`);
  };

  // Save current form state as template
  const handleSaveTemplate = async () => {
    const formValues = form.getValues();
    const dueTime24 = dueTimeInput ? to24Hour(dueTimeInput, dueTimeAmPm) : null;
    const startTime24 = startTimeInput ? to24Hour(startTimeInput, startTimeAmPm) : null;
    const endTime24 = endTimeInput ? to24Hour(endTimeInput, endTimeAmPm) : null;

    const templateData = {
      name: templateName,
      title: formValues.title,
      description: formValues.description || null,
      categoryId: formValues.categoryId || null,
      priority: formValues.priority || 'medium',
      isAllDay: formValues.isAllDay || false,
      defaultTime: formValues.isActivity ? null : dueTime24,
      isActivity: formValues.isActivity || false,
      startTime: formValues.isActivity ? startTime24 : null,
      endTime: formValues.isActivity ? endTime24 : null,
      repeatDays: repeatEnabled && selectedDays.length > 0 ? selectedDays : null,
      repeatInterval: repeatEnabled && selectedDays.length > 0 ? repeatInterval : null,
      defaultAssignments: assignments.map(a => ({
        targetType: a.targetType,
        targetUserId: a.targetUserId || null,
        targetGroupId: a.targetGroupId || null,
      })) as TemplateAssignment[],
      defaultViewers: viewers.map(v => ({
        targetType: v.targetType,
        targetUserId: v.targetUserId || null,
        targetGroupId: v.targetGroupId || null,
      })) as TemplateAssignment[],
      videos: [...existingVideosToKeep, ...pendingVideos],
    };

    try {
      if (overwriteTemplateId) {
        await updateTemplate.mutateAsync({ id: overwriteTemplateId, ...templateData });
        toast.success(`Template "${templateName}" updated`);
      } else {
        await createTemplate.mutateAsync(templateData);
        toast.success(`Template "${templateName}" saved`);
      }
      setSaveTemplateDialogOpen(false);
      setTemplateName('');
      setOverwriteTemplateId(null);
    } catch (error) {
      console.error('Failed to save template:', error);
    }
  };

  // Check if template name exists
  const handleOpenSaveDialog = () => {
    setTemplateName('');
    setOverwriteTemplateId(null);
    setSaveTemplateDialogOpen(true);
  };

  const handleTemplateNameChange = (name: string) => {
    setTemplateName(name);
    const existingTemplate = templates?.find(t => t.name.toLowerCase() === name.toLowerCase());
    if (existingTemplate) {
      setOverwriteTemplateId(existingTemplate.id);
    } else {
      setOverwriteTemplateId(null);
    }
  };

  // Delete template
  const handleDeleteTemplate = async () => {
    if (!deleteTemplateId) return;
    try {
      await deleteTemplate.mutateAsync(deleteTemplateId);
      setDeleteTemplateId(null);
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  const handleAddPendingVideo = (video: VideoInput) => {
    setPendingVideos((prev) => [...prev, video]);
  };

  const handleRemovePendingVideo = (index: number) => {
    setPendingVideos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveExistingVideo = (videoId: string) => {
    setExistingVideosToKeep(prev => prev.filter(v => {
      const existingVideo = task?.videos?.find(ev => ev.url === v.url)
        || loadedTemplate?.videos?.find(ev => ev.url === v.url);
      return existingVideo?.id !== videoId;
    }));
  };

  const toggleRepeatDay = (dayIndex: number) => {
    setSelectedDays(prev =>
      prev.includes(dayIndex)
        ? prev.filter(d => d !== dayIndex)
        : [...prev, dayIndex]
    );
  };

  const isLoading = categoriesLoading || groupsLoading || employeesLoading;
  const isSaving = createTask.isPending || updateTask.isPending;

  // Assignment handlers
  const handleAddAssignment = () => {
    if (newAssignmentType === 'all') {
      if (!assignments.some((a) => a.targetType === 'all')) {
        setAssignments([...assignments, { targetType: 'all' }]);
      }
    } else if (newAssignmentType === 'all_admins') {
      if (!assignments.some((a) => a.targetType === 'all_admins')) {
        setAssignments([...assignments, { targetType: 'all_admins' }]);
      }
    } else if (newAssignmentTarget) {
      const newAssignment: TaskAssignmentInput = {
        targetType: newAssignmentType,
        targetUserId: newAssignmentType === 'user' ? newAssignmentTarget : undefined,
        targetGroupId: newAssignmentType === 'group' ? newAssignmentTarget : undefined,
      };
      const isDuplicate = assignments.some((a) => {
        if (a.targetType !== newAssignmentType) return false;
        if (newAssignmentType === 'user') return a.targetUserId === newAssignmentTarget;
        if (newAssignmentType === 'group') return a.targetGroupId === newAssignmentTarget;
        return false;
      });
      if (!isDuplicate) {
        setAssignments([...assignments, newAssignment]);
      }
      setNewAssignmentTarget('');
    }
  };

  const handleRemoveAssignment = (index: number) => {
    setAssignments(assignments.filter((_, i) => i !== index));
  };

  const handleToggleUserSelection = (userId: string) => {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleAddSelectedUsers = () => {
    const newAssignments: TaskAssignmentInput[] = selectedUsers
      .filter(userId => !assignments.some(a => a.targetType === 'user' && a.targetUserId === userId))
      .map(userId => ({ targetType: 'user' as const, targetUserId: userId }));
    if (newAssignments.length > 0) {
      setAssignments([...assignments, ...newAssignments]);
    }
    setSelectedUsers([]);
    setMultiSelectOpen(false);
  };

  const getAssignmentLabel = (assignment: TaskAssignmentInput) => {
    if (assignment.targetType === 'all') return t('tasks.assignmentTypes.all');
    if (assignment.targetType === 'all_admins') return t('tasks.assignmentTypes.allAdmins');
    if (assignment.targetType === 'group' && assignment.targetGroupId) {
      const group = groups?.find((g) => g.id === assignment.targetGroupId);
      return group?.name || 'Unknown Group';
    }
    if (assignment.targetType === 'user' && assignment.targetUserId) {
      const employee = employees?.find((e) => e.id === assignment.targetUserId);
      return employee?.full_name || 'Unknown User';
    }
    return 'Unknown';
  };

  // Viewer handlers
  const handleAddViewer = () => {
    if (newViewerType === 'all') {
      if (!viewers.some((v) => v.targetType === 'all')) {
        setViewers([...viewers, { targetType: 'all' }]);
      }
    } else if (newViewerType === 'all_admins') {
      if (!viewers.some((v) => v.targetType === 'all_admins')) {
        setViewers([...viewers, { targetType: 'all_admins' }]);
      }
    } else if (newViewerTarget) {
      const newViewer: TaskViewerInput = {
        targetType: newViewerType,
        targetUserId: newViewerType === 'user' ? newViewerTarget : undefined,
        targetGroupId: newViewerType === 'group' ? newViewerTarget : undefined,
      };
      const isDuplicate = viewers.some((v) => {
        if (v.targetType !== newViewerType) return false;
        if (newViewerType === 'user') return v.targetUserId === newViewerTarget;
        if (newViewerType === 'group') return v.targetGroupId === newViewerTarget;
        return false;
      });
      if (!isDuplicate) {
        setViewers([...viewers, newViewer]);
      }
      setNewViewerTarget('');
    }
  };

  const handleRemoveViewer = (index: number) => {
    setViewers(viewers.filter((_, i) => i !== index));
  };

  const handleToggleViewerUserSelection = (userId: string) => {
    setSelectedViewerUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleAddSelectedViewerUsers = () => {
    const newViewers: TaskViewerInput[] = selectedViewerUsers
      .filter(userId => !viewers.some(v => v.targetType === 'user' && v.targetUserId === userId))
      .map(userId => ({ targetType: 'user' as const, targetUserId: userId }));
    if (newViewers.length > 0) {
      setViewers([...viewers, ...newViewers]);
    }
    setSelectedViewerUsers([]);
    setViewerMultiSelectOpen(false);
  };

  const getViewerLabel = (viewer: TaskViewerInput) => {
    if (viewer.targetType === 'all') return t('tasks.assignmentTypes.all');
    if (viewer.targetType === 'all_admins') return t('tasks.assignmentTypes.allAdmins');
    if (viewer.targetType === 'group' && viewer.targetGroupId) {
      const group = groups?.find((g) => g.id === viewer.targetGroupId);
      return group?.name || 'Unknown Group';
    }
    if (viewer.targetType === 'user' && viewer.targetUserId) {
      const employee = employees?.find((e) => e.id === viewer.targetUserId);
      return employee?.full_name || 'Unknown User';
    }
    return 'Unknown';
  };

  const onSubmit = async (data: CreateTaskInput) => {
    const finalAssignments = [...assignments];
    if (newAssignmentType === 'all' && !finalAssignments.some((a) => a.targetType === 'all')) {
      finalAssignments.push({ targetType: 'all' });
    } else if (newAssignmentType === 'all_admins' && !finalAssignments.some((a) => a.targetType === 'all_admins')) {
      finalAssignments.push({ targetType: 'all_admins' });
    } else if (newAssignmentTarget) {
      const pendingAssignment: TaskAssignmentInput = {
        targetType: newAssignmentType,
        targetUserId: newAssignmentType === 'user' ? newAssignmentTarget : undefined,
        targetGroupId: newAssignmentType === 'group' ? newAssignmentTarget : undefined,
      };
      const isDuplicate = finalAssignments.some((a) => {
        if (a.targetType !== newAssignmentType) return false;
        if (newAssignmentType === 'user') return a.targetUserId === newAssignmentTarget;
        if (newAssignmentType === 'group') return a.targetGroupId === newAssignmentTarget;
        return false;
      });
      if (!isDuplicate) finalAssignments.push(pendingAssignment);
    }

    const dueTime24 = dueTimeInput ? to24Hour(dueTimeInput, dueTimeAmPm) : null;
    const startTime24 = startTimeInput ? to24Hour(startTimeInput, startTimeAmPm) : null;
    const endTime24 = endTimeInput ? to24Hour(endTimeInput, endTimeAmPm) : null;

    const finalViewers = [...viewers];
    if (newViewerType === 'all' && !finalViewers.some((v) => v.targetType === 'all')) {
      finalViewers.push({ targetType: 'all' });
    } else if (newViewerType === 'all_admins' && !finalViewers.some((v) => v.targetType === 'all_admins')) {
      finalViewers.push({ targetType: 'all_admins' });
    } else if (newViewerTarget) {
      const pendingViewer: TaskViewerInput = {
        targetType: newViewerType,
        targetUserId: newViewerType === 'user' ? newViewerTarget : undefined,
        targetGroupId: newViewerType === 'group' ? newViewerTarget : undefined,
      };
      const isDuplicate = finalViewers.some((v) => {
        if (v.targetType !== newViewerType) return false;
        if (newViewerType === 'user') return v.targetUserId === newViewerTarget;
        if (newViewerType === 'group') return v.targetGroupId === newViewerTarget;
        return false;
      });
      if (!isDuplicate) finalViewers.push(pendingViewer);
    }

    const submitData = {
      ...data,
      dueTime: data.isActivity ? null : dueTime24,
      startTime: data.isActivity ? startTime24 : null,
      endTime: data.isActivity ? endTime24 : null,
      assignments: finalAssignments,
      viewers: finalViewers,
      videos: [...existingVideosToKeep, ...pendingVideos],
      ...(repeatEnabled && !task && {
        repeatDays: selectedDays,
        repeatInterval: repeatInterval,
        repeatEndDate: repeatEndDate,
      }),
    };

    if (task) {
      await updateTask.mutateAsync({ id: task.id, data: submitData });
    } else {
      await createTask.mutateAsync(submitData);
    }

    onSuccess?.();
    router.push('/tasks');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Template Actions - Only show when creating new task */}
          {!task && (
            <div className="flex flex-wrap gap-3 items-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline">
                    <FolderOpen className="h-4 w-4 mr-2" />
                    {t('templates.loadTemplate')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  {templates && templates.length > 0 ? (
                    <>
                      <DropdownMenuLabel>{t('templates.selectCategory')}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {Object.entries(templatesByCategory).map(([categoryName, categoryTemplates]) => (
                        <DropdownMenuSub key={categoryName}>
                          <DropdownMenuSubTrigger className="gap-2">
                            <Folder className="h-4 w-4" />
                            <span>{categoryName === 'uncategorized' ? t('common.uncategorized') : categoryName}</span>
                            <Badge variant="secondary" className="ml-auto text-xs">
                              {categoryTemplates.length}
                            </Badge>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="w-56 max-h-64 overflow-y-auto">
                            {categoryTemplates.map((template) => (
                              <DropdownMenuItem
                                key={template.id}
                                className="flex items-center justify-between group cursor-pointer"
                                onClick={() => handleLoadTemplate(template)}
                              >
                                <span className="flex-1 truncate">{template.name}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteTemplateId(template.id);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive ml-2"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      ))}
                    </>
                  ) : (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      {t('templates.noTemplates')}
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button type="button" variant="outline" onClick={handleOpenSaveDialog}>
                <Save className="h-4 w-4 mr-2" />
                {t('templates.saveAsTemplate')}
              </Button>

              {loadedTemplate && (
                <Badge variant="secondary" className="text-sm">
                  Template: {loadedTemplate.name}
                </Badge>
              )}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('common.details')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('tasks.taskTitle')}</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter task title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('tasks.description')}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value || ''}
                          placeholder="Enter task description"
                          rows={4}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="categoryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('tasks.category')}</FormLabel>
                        <Select value={field.value || ''} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categories?.map((category) => (
                              <SelectItem key={category.id} value={category.id}>
                                <div className="flex items-center">
                                  <div
                                    className="w-3 h-3 rounded-full mr-2"
                                    style={{ backgroundColor: category.color }}
                                  />
                                  {category.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('tasks.priority')}</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">{t('tasks.priorities.low')}</SelectItem>
                            <SelectItem value="medium">{t('tasks.priorities.medium')}</SelectItem>
                            <SelectItem value="high">{t('tasks.priorities.high')}</SelectItem>
                            <SelectItem value="urgent">{t('tasks.priorities.urgent')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('tasks.dueDate')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('tasks.dueDate')}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isAllDay"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => {
                            field.onChange(checked);
                            if (checked) form.setValue('isActivity', false);
                          }}
                          disabled={form.watch('isActivity')}
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">{t('tasks.allDay')}</FormLabel>
                    </FormItem>
                  )}
                />

                {!form.watch('isAllDay') && (
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="isActivity"
                      render={({ field }) => (
                        <FormItem>
                          <Button
                            type="button"
                            variant={field.value ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                              const newValue = !field.value;
                              field.onChange(newValue);
                              if (newValue) {
                                form.setValue('dueTime', null);
                              } else {
                                form.setValue('startTime', null);
                                form.setValue('endTime', null);
                              }
                            }}
                            className="gap-2"
                          >
                            <CalendarClock className="h-4 w-4" />
                            {t('tasks.activity')}
                          </Button>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('tasks.activityDescription')}
                          </p>
                        </FormItem>
                      )}
                    />

                    {form.watch('isActivity') ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>{t('tasks.startTime')}</Label>
                          <div className="flex gap-2">
                            <Input
                              type="text"
                              inputMode="numeric"
                              placeholder="9:00"
                              value={startTimeInput}
                              onChange={(e) => {
                                let val = e.target.value.replace(/[^\d:]/g, '');
                                if (val.length === 2 && !val.includes(':') && startTimeInput.length < val.length) {
                                  val = val + ':';
                                }
                                if (val.length <= 5) setStartTimeInput(val);
                              }}
                              className="flex-1"
                            />
                            <div className="flex rounded-md border overflow-hidden">
                              <button
                                type="button"
                                onClick={() => setStartTimeAmPm('AM')}
                                className={`px-3 py-2 text-sm font-medium transition-colors ${
                                  startTimeAmPm === 'AM' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                                }`}
                              >
                                AM
                              </button>
                              <button
                                type="button"
                                onClick={() => setStartTimeAmPm('PM')}
                                className={`px-3 py-2 text-sm font-medium transition-colors ${
                                  startTimeAmPm === 'PM' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                                }`}
                              >
                                PM
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>{t('tasks.endTime')}</Label>
                          <div className="flex gap-2">
                            <Input
                              type="text"
                              inputMode="numeric"
                              placeholder="10:00"
                              value={endTimeInput}
                              onChange={(e) => {
                                let val = e.target.value.replace(/[^\d:]/g, '');
                                if (val.length === 2 && !val.includes(':') && endTimeInput.length < val.length) {
                                  val = val + ':';
                                }
                                if (val.length <= 5) setEndTimeInput(val);
                              }}
                              className="flex-1"
                            />
                            <div className="flex rounded-md border overflow-hidden">
                              <button
                                type="button"
                                onClick={() => setEndTimeAmPm('AM')}
                                className={`px-3 py-2 text-sm font-medium transition-colors ${
                                  endTimeAmPm === 'AM' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                                }`}
                              >
                                AM
                              </button>
                              <button
                                type="button"
                                onClick={() => setEndTimeAmPm('PM')}
                                className={`px-3 py-2 text-sm font-medium transition-colors ${
                                  endTimeAmPm === 'PM' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                                }`}
                              >
                                PM
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label>{t('tasks.dueTime')}</Label>
                        <div className="flex gap-2">
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="9:00"
                            value={dueTimeInput}
                            onChange={(e) => {
                              let val = e.target.value.replace(/[^\d:]/g, '');
                              if (val.length === 2 && !val.includes(':') && dueTimeInput.length < val.length) {
                                val = val + ':';
                              }
                              if (val.length <= 5) setDueTimeInput(val);
                            }}
                            className="flex-1"
                          />
                          <div className="flex rounded-md border overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setDueTimeAmPm('AM')}
                              className={`px-3 py-2 text-sm font-medium transition-colors ${
                                dueTimeAmPm === 'AM' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                              }`}
                            >
                              AM
                            </button>
                            <button
                              type="button"
                              onClick={() => setDueTimeAmPm('PM')}
                              className={`px-3 py-2 text-sm font-medium transition-colors ${
                                dueTimeAmPm === 'PM' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                              }`}
                            >
                              PM
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="syncToCalendar"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="!mt-0">{t('tasks.syncCalendar')}</FormLabel>
                    </FormItem>
                  )}
                />

                {/* Repeat System - only show when creating new task */}
                {!task && (
                  <div className="space-y-4 pt-4 border-t">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="repeatEnabled"
                        checked={repeatEnabled}
                        onCheckedChange={(checked) => setRepeatEnabled(!!checked)}
                      />
                      <Label htmlFor="repeatEnabled" className="flex items-center gap-2 cursor-pointer">
                        <Repeat className="h-4 w-4" />
                        Create Repeating Tasks
                      </Label>
                    </div>

                    {repeatEnabled && (
                      <div className="space-y-4 pl-6 border-l-2 border-primary/20">
                        <div className="space-y-2">
                          <Label>Select Days</Label>
                          <div className="flex flex-wrap gap-1">
                            {DAYS_OF_WEEK_LABELS.map((dayLabel, index) => (
                              <button
                                key={index}
                                type="button"
                                onClick={() => toggleRepeatDay(index)}
                                className={`w-10 h-10 rounded-full text-xs font-semibold transition-colors ${
                                  selectedDays.includes(index)
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                                }`}
                              >
                                {dayLabel}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Repeat Frequency</Label>
                          <Select
                            value={repeatInterval}
                            onValueChange={(v) => setRepeatInterval(v as 'weekly' | 'biweekly' | 'monthly')}
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="biweekly">Bi-weekly (every 2 weeks)</SelectItem>
                              <SelectItem value="monthly">Monthly (same week pattern)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Repeat Until</Label>
                          <Input
                            type="date"
                            value={repeatEndDate}
                            onChange={(e) => setRepeatEndDate(e.target.value)}
                            min={form.watch('dueDate') || today}
                          />
                          <p className="text-xs text-muted-foreground">
                            Individual tasks will be created for each occurrence until this date
                          </p>
                        </div>

                        {selectedDays.length > 0 && repeatEndDate && (
                          <div className="p-3 bg-muted/50 rounded-md">
                            <p className="text-sm text-muted-foreground">
                              <span className="font-medium text-foreground">Preview: </span>
                              Tasks will be created on{' '}
                              {selectedDays.sort((a, b) => a - b).map(d => DAYS_OF_WEEK_LABELS[d]).join(', ')}
                              {repeatInterval === 'weekly' && ' every week'}
                              {repeatInterval === 'biweekly' && ' every 2 weeks'}
                              {repeatInterval === 'monthly' && ' each month (same week pattern)'}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('tasks.assignTo')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {assignments.map((assignment, index) => (
                  <Badge key={index} variant="secondary" className="text-sm py-1 px-3">
                    {assignment.targetType === 'all' && <Users className="h-3 w-3 mr-1" />}
                    {assignment.targetType === 'all_admins' && <Users className="h-3 w-3 mr-1" />}
                    {assignment.targetType === 'group' && <Users className="h-3 w-3 mr-1" />}
                    {assignment.targetType === 'user' && <User className="h-3 w-3 mr-1" />}
                    {getAssignmentLabel(assignment)}
                    <button
                      type="button"
                      onClick={() => handleRemoveAssignment(index)}
                      className="ml-2 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={newAssignmentType}
                    onValueChange={(v) => {
                      setNewAssignmentType(v as 'user' | 'group' | 'all' | 'all_admins');
                      setNewAssignmentTarget('');
                    }}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">{t('tasks.assignmentTypes.user')}</SelectItem>
                      <SelectItem value="group">{t('tasks.assignmentTypes.group')}</SelectItem>
                      <SelectItem value="all">{t('tasks.assignmentTypes.all')}</SelectItem>
                      <SelectItem value="all_admins">{t('tasks.assignmentTypes.allAdmins')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newAssignmentType !== 'all' && newAssignmentType !== 'all_admins' && (
                  <div className="flex-1 min-w-48 space-y-2">
                    <Label>{newAssignmentType === 'user' ? 'Employee' : 'Group'}</Label>
                    <Select value={newAssignmentTarget} onValueChange={setNewAssignmentTarget}>
                      <SelectTrigger>
                        <SelectValue placeholder={`Select ${newAssignmentType}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {newAssignmentType === 'user' &&
                          employees?.map((employee) => (
                            <SelectItem key={employee.id} value={employee.id}>
                              <div className="flex items-center">
                                <Avatar className="h-5 w-5 mr-2">
                                  <AvatarImage src={employee.avatar_url || undefined} />
                                  <AvatarFallback className="text-xs">{employee.full_name?.[0] || 'U'}</AvatarFallback>
                                </Avatar>
                                {employee.full_name}
                              </div>
                            </SelectItem>
                          ))}
                        {newAssignmentType === 'group' &&
                          groups?.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              {group.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddAssignment}
                  disabled={newAssignmentType !== 'all' && newAssignmentType !== 'all_admins' && !newAssignmentTarget}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>

                <Popover open={multiSelectOpen} onOpenChange={setMultiSelectOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline">
                      <UserPlus className="h-4 w-4 mr-1" />
                      {t('tasks.selectMultiple')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="start">
                    <div className="p-3 border-b">
                      <p className="font-medium text-sm">{t('tasks.selectEmployees')}</p>
                    </div>
                    <div className="max-h-64 overflow-y-auto p-2">
                      {employees?.map((employee) => {
                        const isAlreadyAssigned = assignments.some(a => a.targetType === 'user' && a.targetUserId === employee.id);
                        const isSelected = selectedUsers.includes(employee.id);
                        return (
                          <div
                            key={employee.id}
                            className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted ${isAlreadyAssigned ? 'opacity-50' : ''}`}
                            onClick={() => !isAlreadyAssigned && handleToggleUserSelection(employee.id)}
                          >
                            <Checkbox
                              checked={isSelected || isAlreadyAssigned}
                              disabled={isAlreadyAssigned}
                              onCheckedChange={() => !isAlreadyAssigned && handleToggleUserSelection(employee.id)}
                            />
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={employee.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">{employee.full_name?.[0] || 'U'}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm flex-1">{employee.full_name}</span>
                            {isAlreadyAssigned && <Badge variant="secondary" className="text-xs">Added</Badge>}
                          </div>
                        );
                      })}
                    </div>
                    <div className="p-3 border-t flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{selectedUsers.length} selected</span>
                      <Button type="button" size="sm" onClick={handleAddSelectedUsers} disabled={selectedUsers.length === 0}>
                        {t('tasks.addSelected')}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                {t('tasks.viewableBy')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{t('tasks.viewableByDescription')}</p>
              <div className="flex flex-wrap gap-2">
                {viewers.map((viewer, index) => (
                  <Badge key={index} variant="outline" className="text-sm py-1 px-3 bg-slate-50">
                    {viewer.targetType === 'all' && <Users className="h-3 w-3 mr-1" />}
                    {viewer.targetType === 'all_admins' && <Users className="h-3 w-3 mr-1" />}
                    {viewer.targetType === 'group' && <Users className="h-3 w-3 mr-1" />}
                    {viewer.targetType === 'user' && <Eye className="h-3 w-3 mr-1" />}
                    {getViewerLabel(viewer)}
                    <button
                      type="button"
                      onClick={() => handleRemoveViewer(index)}
                      className="ml-2 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={newViewerType}
                    onValueChange={(v) => {
                      setNewViewerType(v as 'user' | 'group' | 'all' | 'all_admins');
                      setNewViewerTarget('');
                    }}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">{t('tasks.assignmentTypes.user')}</SelectItem>
                      <SelectItem value="group">{t('tasks.assignmentTypes.group')}</SelectItem>
                      <SelectItem value="all">{t('tasks.assignmentTypes.all')}</SelectItem>
                      <SelectItem value="all_admins">{t('tasks.assignmentTypes.allAdmins')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newViewerType !== 'all' && newViewerType !== 'all_admins' && (
                  <div className="flex-1 min-w-48 space-y-2">
                    <Label>{newViewerType === 'user' ? 'Employee' : 'Group'}</Label>
                    <Select value={newViewerTarget} onValueChange={setNewViewerTarget}>
                      <SelectTrigger>
                        <SelectValue placeholder={`Select ${newViewerType}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {newViewerType === 'user' &&
                          employees?.map((employee) => (
                            <SelectItem key={employee.id} value={employee.id}>
                              <div className="flex items-center">
                                <Avatar className="h-5 w-5 mr-2">
                                  <AvatarImage src={employee.avatar_url || undefined} />
                                  <AvatarFallback className="text-xs">{employee.full_name?.[0] || 'U'}</AvatarFallback>
                                </Avatar>
                                {employee.full_name}
                              </div>
                            </SelectItem>
                          ))}
                        {newViewerType === 'group' &&
                          groups?.map((group) => (
                            <SelectItem key={group.id} value={group.id}>
                              {group.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddViewer}
                  disabled={newViewerType !== 'all' && newViewerType !== 'all_admins' && !newViewerTarget}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>

                <Popover open={viewerMultiSelectOpen} onOpenChange={setViewerMultiSelectOpen}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline">
                      <UserPlus className="h-4 w-4 mr-1" />
                      {t('tasks.selectMultiple')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-0" align="start">
                    <div className="p-3 border-b">
                      <p className="font-medium text-sm">{t('tasks.selectEmployees')}</p>
                    </div>
                    <div className="max-h-64 overflow-y-auto p-2">
                      {employees?.map((employee) => {
                        const isAlreadyViewer = viewers.some(v => v.targetType === 'user' && v.targetUserId === employee.id);
                        const isSelected = selectedViewerUsers.includes(employee.id);
                        return (
                          <div
                            key={employee.id}
                            className={`flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-muted ${isAlreadyViewer ? 'opacity-50' : ''}`}
                            onClick={() => !isAlreadyViewer && handleToggleViewerUserSelection(employee.id)}
                          >
                            <Checkbox
                              checked={isSelected || isAlreadyViewer}
                              disabled={isAlreadyViewer}
                              onCheckedChange={() => !isAlreadyViewer && handleToggleViewerUserSelection(employee.id)}
                            />
                            <Avatar className="h-6 w-6">
                              <AvatarImage src={employee.avatar_url || undefined} />
                              <AvatarFallback className="text-xs">{employee.full_name?.[0] || 'U'}</AvatarFallback>
                            </Avatar>
                            <span className="text-sm flex-1">{employee.full_name}</span>
                            {isAlreadyViewer && <Badge variant="secondary" className="text-xs">Added</Badge>}
                          </div>
                        );
                      })}
                    </div>
                    <div className="p-3 border-t flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{selectedViewerUsers.length} selected</span>
                      <Button type="button" size="sm" onClick={handleAddSelectedViewerUsers} disabled={selectedViewerUsers.length === 0}>
                        {t('tasks.addSelected')}
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>

          <TaskVideosSection
            existingVideos={task?.videos || loadedTemplate?.videos}
            pendingVideos={pendingVideos}
            onAddVideo={handleAddPendingVideo}
            onRemoveVideo={handleRemovePendingVideo}
            onRemoveExistingVideo={handleRemoveExistingVideo}
          />

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.push('/tasks')}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {task ? t('common.save') : t('common.create')}
            </Button>
          </div>
        </form>
      </Form>

      {/* Save Template Dialog */}
      <Dialog open={saveTemplateDialogOpen} onOpenChange={setSaveTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('templates.saveAsTemplate')}</DialogTitle>
            <DialogDescription>
              {t('templates.saveDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="templateName">{t('templates.templateName')}</Label>
              <Input
                id="templateName"
                value={templateName}
                onChange={(e) => handleTemplateNameChange(e.target.value)}
                placeholder={t('templates.enterTemplateName')}
              />
              {overwriteTemplateId && (
                <p className="text-sm text-amber-600">
                  {t('templates.templateExists')}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveTemplateDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={!templateName.trim() || createTemplate.isPending || updateTemplate.isPending}
            >
              {(createTemplate.isPending || updateTemplate.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {overwriteTemplateId ? t('templates.overwrite') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Template Confirmation */}
      <AlertDialog open={!!deleteTemplateId} onOpenChange={() => setDeleteTemplateId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('templates.deleteTemplate')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('templates.deleteConfirmation')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTemplate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTemplate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('common.delete')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
