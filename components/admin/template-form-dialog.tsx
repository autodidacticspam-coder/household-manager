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
import { Loader2, X, CalendarClock, Eye } from 'lucide-react';
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
  isActivity: boolean;
  defaultTime: string;
  defaultTimeAmPm: 'AM' | 'PM';
  startTime: string;
  startTimeAmPm: 'AM' | 'PM';
  endTime: string;
  endTimeAmPm: 'AM' | 'PM';
  repeatEnabled: boolean;
  selectedDays: number[];
  repeatInterval: 'weekly' | 'biweekly' | 'monthly';
  assignments: TemplateAssignment[];
  assignType: AssignmentTargetType;
  assignTarget: string;
  viewers: TemplateAssignment[];
  viewerType: AssignmentTargetType;
  viewerTarget: string;
  pendingVideos: VideoInput[];
  existingVideos: TemplateVideo[];
};

const DAYS_OF_WEEK_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseTime12(time24: string | null | undefined): { time: string; ampm: 'AM' | 'PM' } {
  if (!time24) return { time: '', ampm: 'AM' };
  const [h, m] = time24.split(':').map(Number);
  const isPm = h >= 12;
  const h12 = h % 12 || 12;
  return { time: `${h12}:${m.toString().padStart(2, '0')}`, ampm: isPm ? 'PM' : 'AM' };
}

function getInitialFormState(template?: TaskTemplate | null): FormState {
  if (!template) {
    return {
      name: '',
      title: '',
      description: '',
      categoryId: '',
      priority: 'medium',
      isAllDay: false,
      isActivity: false,
      defaultTime: '',
      defaultTimeAmPm: 'AM',
      startTime: '',
      startTimeAmPm: 'AM',
      endTime: '',
      endTimeAmPm: 'PM',
      repeatEnabled: false,
      selectedDays: [],
      repeatInterval: 'weekly',
      assignments: [],
      assignType: 'user',
      assignTarget: '',
      viewers: [],
      viewerType: 'user',
      viewerTarget: '',
      pendingVideos: [],
      existingVideos: [],
    };
  }

  const defaultTimeParsed = parseTime12(template.defaultTime);
  const startTimeParsed = parseTime12(template.startTime);
  const endTimeParsed = parseTime12(template.endTime);

  return {
    name: template.name,
    title: template.title,
    description: template.description || '',
    categoryId: template.categoryId || '',
    priority: template.priority,
    isAllDay: template.isAllDay,
    isActivity: template.isActivity || false,
    defaultTime: defaultTimeParsed.time,
    defaultTimeAmPm: defaultTimeParsed.ampm,
    startTime: startTimeParsed.time,
    startTimeAmPm: startTimeParsed.ampm,
    endTime: endTimeParsed.time,
    endTimeAmPm: endTimeParsed.ampm,
    repeatEnabled: (template.repeatDays && template.repeatDays.length > 0) || false,
    selectedDays: template.repeatDays || [],
    repeatInterval: (template.repeatInterval as 'weekly' | 'biweekly' | 'monthly') || 'weekly',
    assignments: template.defaultAssignments,
    assignType: 'user',
    assignTarget: '',
    viewers: template.defaultViewers || [],
    viewerType: 'user',
    viewerTarget: '',
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
    name, title, description, categoryId, priority, isAllDay, isActivity,
    defaultTime, defaultTimeAmPm, startTime, startTimeAmPm, endTime, endTimeAmPm,
    repeatEnabled, selectedDays, repeatInterval,
    assignments, assignType, assignTarget, viewers, viewerType, viewerTarget,
    pendingVideos, existingVideos
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

  // Viewer management
  const handleAddViewer = () => {
    if (viewerType === 'all' || viewerType === 'all_admins') {
      if (!viewers.some(v => v.targetType === viewerType)) {
        updateField('viewers', [...viewers, { targetType: viewerType, targetUserId: null, targetGroupId: null }]);
      }
    } else if (viewerTarget) {
      const exists = viewers.some(v =>
        (viewerType === 'user' && v.targetUserId === viewerTarget) ||
        (viewerType === 'group' && v.targetGroupId === viewerTarget)
      );
      if (!exists) {
        updateField('viewers', [
          ...viewers,
          {
            targetType: viewerType,
            targetUserId: viewerType === 'user' ? viewerTarget : null,
            targetGroupId: viewerType === 'group' ? viewerTarget : null,
          },
        ]);
      }
      updateField('viewerTarget', '');
    }
  };

  const handleRemoveViewer = (index: number) => {
    updateField('viewers', viewers.filter((_, i) => i !== index));
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

  const toggleDay = (dayIndex: number) => {
    const newDays = selectedDays.includes(dayIndex)
      ? selectedDays.filter((d) => d !== dayIndex)
      : [...selectedDays, dayIndex].sort((a, b) => a - b);
    updateField('selectedDays', newDays);
  };

  const handleSubmit = async () => {
    // For activities, use startTime/endTime; otherwise use defaultTime
    const time24 = !isActivity && defaultTime && !isAllDay ? formatTime24h(`${defaultTime} ${defaultTimeAmPm}`) : null;
    const startTime24 = isActivity && startTime && !isAllDay ? formatTime24h(`${startTime} ${startTimeAmPm}`) : null;
    const endTime24 = isActivity && endTime && !isAllDay ? formatTime24h(`${endTime} ${endTimeAmPm}`) : null;

    const data = {
      name,
      title,
      description: description || null,
      categoryId: categoryId || null,
      priority,
      isAllDay,
      isActivity,
      defaultTime: time24,
      startTime: startTime24,
      endTime: endTime24,
      repeatDays: repeatEnabled && selectedDays.length > 0 ? selectedDays : null,
      repeatInterval: repeatEnabled && selectedDays.length > 0 ? repeatInterval : null,
      defaultAssignments: assignments,
      defaultViewers: viewers,
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
              onCheckedChange={(checked) => {
                updateField('isAllDay', checked as boolean);
                if (checked) updateField('isActivity', false);
              }}
              disabled={isActivity}
            />
            <Label htmlFor="allDay">{t('tasks.allDay')}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="repeat"
              checked={repeatEnabled}
              onCheckedChange={(checked) => updateField('repeatEnabled', checked as boolean)}
            />
            <Label htmlFor="repeat">{t('tasks.repeat')}</Label>
          </div>
        </div>

        {!isAllDay && (
          <div className="space-y-4">
            <Button
              type="button"
              variant={isActivity ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                updateField('isActivity', !isActivity);
                if (!isActivity) {
                  updateField('isAllDay', false);
                }
              }}
              className="gap-2"
            >
              <CalendarClock className="h-4 w-4" />
              {t('tasks.activity')}
            </Button>
            <p className="text-xs text-muted-foreground">
              {t('tasks.activityDescription')}
            </p>

            {isActivity ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('tasks.startTime')}</Label>
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={startTime}
                      onChange={(e) => {
                        let val = e.target.value.replace(/[^\d:]/g, '');
                        if (val.length === 2 && !val.includes(':') && startTime.length < val.length) {
                          val = val + ':';
                        }
                        if (val.length <= 5) updateField('startTime', val);
                      }}
                      placeholder="9:00"
                      className="flex-1"
                    />
                    <div className="flex rounded-md border overflow-hidden">
                      <button
                        type="button"
                        onClick={() => updateField('startTimeAmPm', 'AM')}
                        className={`px-2 py-1 text-xs font-medium transition-colors ${
                          startTimeAmPm === 'AM'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background hover:bg-muted'
                        }`}
                      >
                        AM
                      </button>
                      <button
                        type="button"
                        onClick={() => updateField('startTimeAmPm', 'PM')}
                        className={`px-2 py-1 text-xs font-medium transition-colors ${
                          startTimeAmPm === 'PM'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background hover:bg-muted'
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
                      value={endTime}
                      onChange={(e) => {
                        let val = e.target.value.replace(/[^\d:]/g, '');
                        if (val.length === 2 && !val.includes(':') && endTime.length < val.length) {
                          val = val + ':';
                        }
                        if (val.length <= 5) updateField('endTime', val);
                      }}
                      placeholder="10:00"
                      className="flex-1"
                    />
                    <div className="flex rounded-md border overflow-hidden">
                      <button
                        type="button"
                        onClick={() => updateField('endTimeAmPm', 'AM')}
                        className={`px-2 py-1 text-xs font-medium transition-colors ${
                          endTimeAmPm === 'AM'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background hover:bg-muted'
                        }`}
                      >
                        AM
                      </button>
                      <button
                        type="button"
                        onClick={() => updateField('endTimeAmPm', 'PM')}
                        className={`px-2 py-1 text-xs font-medium transition-colors ${
                          endTimeAmPm === 'PM'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background hover:bg-muted'
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
          </div>
        )}

        {repeatEnabled && (
          <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
            <div className="space-y-2">
              <Label>{t('tasks.selectDays')}</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS_OF_WEEK_LABELS.map((day, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => toggleDay(index)}
                    className={`w-10 h-10 rounded-full text-sm font-medium transition-colors
                      ${selectedDays.includes(index)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background border hover:bg-muted'
                      }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('tasks.repeatInterval')}</Label>
              <Select value={repeatInterval} onValueChange={(v) => updateField('repeatInterval', v as 'weekly' | 'biweekly' | 'monthly')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">{t('tasks.repeatOptions.weekly')}</SelectItem>
                  <SelectItem value="biweekly">{t('tasks.repeatOptions.biweekly')}</SelectItem>
                  <SelectItem value="monthly">{t('tasks.repeatOptions.monthly')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
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

        {/* Viewers Section */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            {t('tasks.viewableBy')}
          </Label>
          <p className="text-xs text-muted-foreground mb-2">
            {t('tasks.viewableByDescription')}
          </p>
          {viewers.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {viewers.map((viewer, index) => (
                <Badge key={index} variant="outline" className="flex items-center gap-1 bg-slate-50">
                  {getAssignmentLabel(viewer)}
                  <button
                    type="button"
                    onClick={() => handleRemoveViewer(index)}
                    className="ml-1 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Select value={viewerType} onValueChange={(v) => updateField('viewerType', v as AssignmentTargetType)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">{t('tasks.user')}</SelectItem>
                <SelectItem value="group">{t('tasks.group')}</SelectItem>
                <SelectItem value="all">{t('tasks.all')}</SelectItem>
                <SelectItem value="all_admins">{t('tasks.assignmentTypes.allAdmins')}</SelectItem>
              </SelectContent>
            </Select>
            {viewerType === 'user' && (
              <Select value={viewerTarget} onValueChange={(v) => updateField('viewerTarget', v)}>
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
            {viewerType === 'group' && (
              <Select value={viewerTarget} onValueChange={(v) => updateField('viewerTarget', v)}>
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
            <Button type="button" variant="outline" onClick={handleAddViewer}>
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
