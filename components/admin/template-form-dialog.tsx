'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, X } from 'lucide-react';
import { useTaskCategories, useEmployees, useEmployeeGroups } from '@/hooks/use-tasks';
import { useCreateTaskTemplate, useUpdateTaskTemplate, useDeleteTemplateVideo, type VideoInput } from '@/hooks/use-task-templates';
import type { TaskTemplate, TemplateAssignment, TemplateVideo, AssignmentTargetType } from '@/types';
import { formatTime24h } from '@/lib/format-time';
import { TaskVideosSection } from './task-videos-section';

type TemplateFormDialogProps = {
  open: boolean;
  onClose: () => void;
  template?: TaskTemplate | null;
};

type FormState = {
  name: string;
  title: string;
  description: string;
  categoryId: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  isAllDay: boolean;
  defaultTime: string;
  defaultTimeAmPm: 'AM' | 'PM';
  isRecurring: boolean;
  recurrencePreset: string;
  assignments: TemplateAssignment[];
  assignType: AssignmentTargetType;
  assignTarget: string;
  pendingVideos: VideoInput[];
  existingVideos: TemplateVideo[];
};

function getInitialFormState(template?: TaskTemplate | null): FormState {
  if (!template) {
    return {
      name: '',
      title: '',
      description: '',
      categoryId: '',
      priority: 'medium',
      isAllDay: false,
      defaultTime: '',
      defaultTimeAmPm: 'AM',
      isRecurring: false,
      recurrencePreset: 'daily',
      assignments: [],
      assignType: 'user',
      assignTarget: '',
      pendingVideos: [],
      existingVideos: [],
    };
  }

  let defaultTime = '';
  let defaultTimeAmPm: 'AM' | 'PM' = 'AM';

  if (template.defaultTime) {
    const [h, m] = template.defaultTime.split(':').map(Number);
    const isPm = h >= 12;
    const h12 = h % 12 || 12;
    defaultTime = `${h12}:${m.toString().padStart(2, '0')}`;
    defaultTimeAmPm = isPm ? 'PM' : 'AM';
  }

  return {
    name: template.name,
    title: template.title,
    description: template.description || '',
    categoryId: template.categoryId || '',
    priority: template.priority,
    isAllDay: template.isAllDay,
    defaultTime,
    defaultTimeAmPm,
    isRecurring: template.isRecurring,
    recurrencePreset: template.recurrenceRule || 'daily',
    assignments: template.defaultAssignments,
    assignType: 'user',
    assignTarget: '',
    pendingVideos: [],
    existingVideos: template.videos || [],
  };
}

// Inner form component - receives key to force remount when template changes
function TemplateFormContent({
  template,
  onClose
}: {
  template?: TaskTemplate | null;
  onClose: () => void;
}) {
  const t = useTranslations();
  const { data: categories } = useTaskCategories();
  const { data: employees } = useEmployees();
  const { data: groups } = useEmployeeGroups();
  const createTemplate = useCreateTaskTemplate();
  const updateTemplate = useUpdateTaskTemplate();
  const deleteVideo = useDeleteTemplateVideo();

  // Initialize state from template - no useEffect needed since key-based remount handles resets
  const [formState, setFormState] = useState<FormState>(() => getInitialFormState(template));

  // Destructure for easier access
  const {
    name, title, description, categoryId, priority, isAllDay,
    defaultTime, defaultTimeAmPm, isRecurring, recurrencePreset,
    assignments, assignType, assignTarget, pendingVideos, existingVideos
  } = formState;

  // Helper to update a single field
  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  };

  const handleAddAssignment = () => {
    if (assignType === 'all' || assignType === 'all_admins') {
      if (!assignments.some(a => a.targetType === assignType)) {
        updateField('assignments', [...assignments, { targetType: assignType, targetUserId: null, targetGroupId: null }]);
      }
    } else if (assignTarget) {
      const exists = assignments.some(a =>
        (assignType === 'user' && a.targetUserId === assignTarget) ||
        (assignType === 'group' && a.targetGroupId === assignTarget)
      );
      if (!exists) {
        updateField('assignments', [
          ...assignments,
          {
            targetType: assignType,
            targetUserId: assignType === 'user' ? assignTarget : null,
            targetGroupId: assignType === 'group' ? assignTarget : null,
          },
        ]);
      }
      updateField('assignTarget', '');
    }
  };

  const handleRemoveAssignment = (index: number) => {
    updateField('assignments', assignments.filter((_, i) => i !== index));
  };

  const getAssignmentLabel = (assignment: TemplateAssignment) => {
    if (assignment.targetType === 'all') return t('tasks.allEmployees');
    if (assignment.targetType === 'all_admins') return t('tasks.allAdmins');
    if (assignment.targetType === 'user' && assignment.targetUserId) {
      const user = employees?.find(e => e.id === assignment.targetUserId);
      return user?.full_name || 'Unknown';
    }
    if (assignment.targetType === 'group' && assignment.targetGroupId) {
      const group = groups?.find(g => g.id === assignment.targetGroupId);
      return group?.name || 'Unknown';
    }
    return 'Unknown';
  };

  const handleAddVideo = (video: VideoInput) => {
    updateField('pendingVideos', [...pendingVideos, video]);
  };

  const handleRemovePendingVideo = (index: number) => {
    updateField('pendingVideos', pendingVideos.filter((_, i) => i !== index));
  };

  const handleRemoveExistingVideo = async (videoId: string) => {
    const video = existingVideos.find(v => v.id === videoId);
    if (video) {
      await deleteVideo.mutateAsync({
        id: video.id,
        url: video.url,
        videoType: video.videoType,
      });
      updateField('existingVideos', existingVideos.filter(v => v.id !== videoId));
    }
  };

  const handleSubmit = async () => {
    const time24 = defaultTime && !isAllDay ? formatTime24h(`${defaultTime} ${defaultTimeAmPm}`) : null;

    const data = {
      name,
      title,
      description: description || null,
      categoryId: categoryId || null,
      priority,
      isAllDay,
      defaultTime: time24,
      isActivity: false,
      startTime: null,
      endTime: null,
      isRecurring,
      recurrenceRule: isRecurring ? recurrencePreset : null,
      defaultAssignments: assignments,
      videos: pendingVideos,
    };

    if (template) {
      await updateTemplate.mutateAsync({ id: template.id, ...data });
    } else {
      await createTemplate.mutateAsync(data);
    }
    onClose();
  };

  const isPending = createTemplate.isPending || updateTemplate.isPending;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {template ? t('templates.edit') : t('templates.create')}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t('templates.name')}</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder={t('templates.namePlaceholder')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">{t('tasks.title')}</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => updateField('title', e.target.value)}
            placeholder={t('tasks.titlePlaceholder')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">{t('tasks.description')}</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => updateField('description', e.target.value)}
            rows={2}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('tasks.category')}</Label>
            <Select value={categoryId} onValueChange={(v) => updateField('categoryId', v)}>
              <SelectTrigger>
                <SelectValue placeholder={t('common.select')} />
              </SelectTrigger>
              <SelectContent>
                {categories?.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('tasks.priority')}</Label>
            <Select value={priority} onValueChange={(v) => updateField('priority', v as FormState['priority'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">{t('tasks.priorities.low')}</SelectItem>
                <SelectItem value="medium">{t('tasks.priorities.medium')}</SelectItem>
                <SelectItem value="high">{t('tasks.priorities.high')}</SelectItem>
                <SelectItem value="urgent">{t('tasks.priorities.urgent')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="allDay"
              checked={isAllDay}
              onCheckedChange={(checked) => updateField('isAllDay', checked as boolean)}
            />
            <Label htmlFor="allDay">{t('tasks.allDay')}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="recurring"
              checked={isRecurring}
              onCheckedChange={(checked) => updateField('isRecurring', checked as boolean)}
            />
            <Label htmlFor="recurring">{t('tasks.recurring')}</Label>
          </div>
        </div>

        {!isAllDay && (
          <div className="space-y-2">
            <Label>{t('tasks.defaultTime')}</Label>
            <div className="flex gap-2">
              <Input
                type="text"
                inputMode="numeric"
                value={defaultTime}
                onChange={(e) => {
                  let val = e.target.value.replace(/[^\d:]/g, '');
                  if (val.length === 2 && !val.includes(':') && defaultTime.length < val.length) {
                    val = val + ':';
                  }
                  if (val.length <= 5) updateField('defaultTime', val);
                }}
                placeholder="9:00"
                className="flex-1"
              />
              <div className="flex rounded-md border overflow-hidden">
                <button
                  type="button"
                  onClick={() => updateField('defaultTimeAmPm', 'AM')}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    defaultTimeAmPm === 'AM'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background hover:bg-muted'
                  }`}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => updateField('defaultTimeAmPm', 'PM')}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    defaultTimeAmPm === 'PM'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background hover:bg-muted'
                  }`}
                >
                  PM
                </button>
              </div>
            </div>
          </div>
        )}

        {isRecurring && (
          <div className="space-y-2">
            <Label>{t('tasks.recurrence')}</Label>
            <Select value={recurrencePreset} onValueChange={(v) => updateField('recurrencePreset', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FREQ=DAILY">{t('tasks.recurrenceOptions.daily')}</SelectItem>
                <SelectItem value="FREQ=WEEKLY">{t('tasks.recurrenceOptions.weekly')}</SelectItem>
                <SelectItem value="FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR">{t('tasks.recurrenceOptions.weekdays')}</SelectItem>
                <SelectItem value="FREQ=MONTHLY">{t('tasks.recurrenceOptions.monthly')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label>{t('tasks.assignTo')}</Label>
          {assignments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {assignments.map((assignment, index) => (
                <Badge key={index} variant="secondary" className="flex items-center gap-1">
                  {getAssignmentLabel(assignment)}
                  <button
                    type="button"
                    onClick={() => handleRemoveAssignment(index)}
                    className="ml-1 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Select value={assignType} onValueChange={(v) => updateField('assignType', v as AssignmentTargetType)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">{t('tasks.user')}</SelectItem>
                <SelectItem value="group">{t('tasks.group')}</SelectItem>
                <SelectItem value="all">{t('tasks.all')}</SelectItem>
              </SelectContent>
            </Select>
            {assignType === 'user' && (
              <Select value={assignTarget} onValueChange={(v) => updateField('assignTarget', v)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={t('tasks.selectUser')} />
                </SelectTrigger>
                <SelectContent>
                  {employees?.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {assignType === 'group' && (
              <Select value={assignTarget} onValueChange={(v) => updateField('assignTarget', v)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={t('tasks.selectGroup')} />
                </SelectTrigger>
                <SelectContent>
                  {groups?.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button type="button" variant="outline" onClick={handleAddAssignment}>
              {t('common.add')}
            </Button>
          </div>
        </div>

        {/* Videos Section */}
        <TaskVideosSection
          existingVideos={existingVideos}
          pendingVideos={pendingVideos}
          onAddVideo={handleAddVideo}
          onRemoveVideo={handleRemovePendingVideo}
          onRemoveExistingVideo={handleRemoveExistingVideo}
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button onClick={handleSubmit} disabled={!name || !title || isPending}>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : null}
          {template ? t('common.save') : t('templates.create')}
        </Button>
      </DialogFooter>
    </>
  );
}

// Wrapper component - uses key to force remount when template/open changes
export function TemplateFormDialog({ open, onClose, template }: TemplateFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Key forces remount when dialog opens or template changes, resetting form state */}
        <TemplateFormContent
          key={`${template?.id ?? 'new'}-${open}`}
          template={template}
          onClose={onClose}
        />
      </DialogContent>
    </Dialog>
  );
}
