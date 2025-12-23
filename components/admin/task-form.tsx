'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, X, Plus, Users, User } from 'lucide-react';
import { useTaskCategories, useEmployeeGroups, useEmployees, useCreateTask, useUpdateTask } from '@/hooks/use-tasks';
import { createTaskSchema, type CreateTaskInput, type TaskAssignmentInput } from '@/lib/validators/task';
import type { TaskWithRelations } from '@/types';

type TaskFormProps = {
  task?: TaskWithRelations;
  onSuccess?: () => void;
};

export function TaskForm({ task, onSuccess }: TaskFormProps) {
  const t = useTranslations();
  const router = useRouter();

  const { data: categories, isLoading: categoriesLoading } = useTaskCategories();
  const { data: groups, isLoading: groupsLoading } = useEmployeeGroups();
  const { data: employees, isLoading: employeesLoading } = useEmployees();

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  const [assignments, setAssignments] = useState<TaskAssignmentInput[]>(
    task?.assignments?.map((a) => ({
      targetType: a.targetType,
      targetUserId: a.targetUserId,
      targetGroupId: a.targetGroupId,
    })) || []
  );

  const [newAssignmentType, setNewAssignmentType] = useState<'user' | 'group' | 'all' | 'all_admins'>('user');
  const [newAssignmentTarget, setNewAssignmentTarget] = useState<string>('');

  // Custom recurrence state
  const [recurrenceType, setRecurrenceType] = useState<'preset' | 'custom'>('preset');
  const [customDays, setCustomDays] = useState<string[]>([]);
  const [weekInterval, setWeekInterval] = useState<number>(1);

  const DAYS_OF_WEEK = [
    { value: 'MO', label: 'Mon' },
    { value: 'TU', label: 'Tue' },
    { value: 'WE', label: 'Wed' },
    { value: 'TH', label: 'Thu' },
    { value: 'FR', label: 'Fri' },
    { value: 'SA', label: 'Sat' },
    { value: 'SU', label: 'Sun' },
  ];

  const toggleDay = (day: string) => {
    setCustomDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const buildCustomRecurrenceRule = () => {
    if (customDays.length === 0) return '';
    const interval = weekInterval > 1 ? `;INTERVAL=${weekInterval}` : '';
    return `FREQ=WEEKLY${interval};BYDAY=${customDays.join(',')}`;
  };

  const today = format(new Date(), 'yyyy-MM-dd');

  const form = useForm<CreateTaskInput>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      title: task?.title || '',
      description: task?.description || '',
      categoryId: task?.categoryId || undefined,
      priority: task?.priority || 'medium',
      dueDate: task?.dueDate || today,
      dueTime: task?.dueTime || undefined,
      isAllDay: task?.isAllDay ?? false,
      isRecurring: task?.isRecurring ?? false,
      recurrenceRule: task?.recurrenceRule || undefined,
      syncToCalendar: task?.syncToCalendar ?? false,
      assignments: assignments,
    },
  });

  const isLoading = categoriesLoading || groupsLoading || employeesLoading;
  const isSaving = createTask.isPending || updateTask.isPending;

  const handleAddAssignment = () => {
    if (newAssignmentType === 'all') {
      // Check if "all" assignment already exists
      if (!assignments.some((a) => a.targetType === 'all')) {
        setAssignments([...assignments, { targetType: 'all' }]);
      }
    } else if (newAssignmentType === 'all_admins') {
      // Check if "all_admins" assignment already exists
      if (!assignments.some((a) => a.targetType === 'all_admins')) {
        setAssignments([...assignments, { targetType: 'all_admins' }]);
      }
    } else if (newAssignmentTarget) {
      const newAssignment: TaskAssignmentInput = {
        targetType: newAssignmentType,
        targetUserId: newAssignmentType === 'user' ? newAssignmentTarget : undefined,
        targetGroupId: newAssignmentType === 'group' ? newAssignmentTarget : undefined,
      };

      // Check for duplicates
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

  const getAssignmentLabel = (assignment: TaskAssignmentInput) => {
    if (assignment.targetType === 'all') {
      return t('tasks.assignmentTypes.all');
    }
    if (assignment.targetType === 'all_admins') {
      return t('tasks.assignmentTypes.allAdmins');
    }
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

  const onSubmit = async (data: CreateTaskInput) => {
    // Auto-add any pending assignment selection
    let finalAssignments = [...assignments];

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
      if (!isDuplicate) {
        finalAssignments.push(pendingAssignment);
      }
    }

    // Assignments are now optional - task can be created without assignments
    const submitData = {
      ...data,
      assignments: finalAssignments,
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
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                      <Select
                        value={field.value || ''}
                        onValueChange={field.onChange}
                      >
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
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="dueDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('tasks.dueDate')}</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dueTime"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('tasks.dueTime')}</FormLabel>
                      <FormControl>
                        <Input
                          type="time"
                          {...field}
                          value={field.value || ''}
                          disabled={form.watch('isAllDay')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="isAllDay"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">{t('tasks.allDay')}</FormLabel>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="syncToCalendar"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">{t('tasks.syncCalendar')}</FormLabel>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isRecurring"
                render={({ field }) => (
                  <FormItem className="flex items-center space-x-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">Recurring Task</FormLabel>
                  </FormItem>
                )}
              />

              {form.watch('isRecurring') && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Recurrence Type</Label>
                    <div className="flex gap-4">
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id="preset"
                          name="recurrenceType"
                          checked={recurrenceType === 'preset'}
                          onChange={() => setRecurrenceType('preset')}
                          className="h-4 w-4"
                        />
                        <Label htmlFor="preset" className="font-normal">Preset</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id="custom"
                          name="recurrenceType"
                          checked={recurrenceType === 'custom'}
                          onChange={() => setRecurrenceType('custom')}
                          className="h-4 w-4"
                        />
                        <Label htmlFor="custom" className="font-normal">Custom</Label>
                      </div>
                    </div>
                  </div>

                  {recurrenceType === 'preset' ? (
                    <FormField
                      control={form.control}
                      name="recurrenceRule"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Repeat</FormLabel>
                          <Select
                            value={field.value || ''}
                            onValueChange={field.onChange}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select frequency" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="FREQ=DAILY">Daily</SelectItem>
                              <SelectItem value="FREQ=WEEKLY">Weekly</SelectItem>
                              <SelectItem value="FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR">Weekdays</SelectItem>
                              <SelectItem value="FREQ=MONTHLY">Monthly</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Select Days</Label>
                        <div className="flex flex-wrap gap-2">
                          {DAYS_OF_WEEK.map((day) => (
                            <Button
                              key={day.value}
                              type="button"
                              variant={customDays.includes(day.value) ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => {
                                toggleDay(day.value);
                                const newDays = customDays.includes(day.value)
                                  ? customDays.filter(d => d !== day.value)
                                  : [...customDays, day.value];
                                if (newDays.length > 0) {
                                  const interval = weekInterval > 1 ? `;INTERVAL=${weekInterval}` : '';
                                  form.setValue('recurrenceRule', `FREQ=WEEKLY${interval};BYDAY=${newDays.join(',')}`);
                                } else {
                                  form.setValue('recurrenceRule', '');
                                }
                              }}
                              className="w-12"
                            >
                              {day.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Repeat Every</Label>
                        <div className="flex items-center gap-2">
                          <Select
                            value={String(weekInterval)}
                            onValueChange={(v) => {
                              const newInterval = parseInt(v);
                              setWeekInterval(newInterval);
                              if (customDays.length > 0) {
                                const interval = newInterval > 1 ? `;INTERVAL=${newInterval}` : '';
                                form.setValue('recurrenceRule', `FREQ=WEEKLY${interval};BYDAY=${customDays.join(',')}`);
                              }
                            }}
                          >
                            <SelectTrigger className="w-20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1</SelectItem>
                              <SelectItem value="2">2</SelectItem>
                              <SelectItem value="3">3</SelectItem>
                              <SelectItem value="4">4</SelectItem>
                            </SelectContent>
                          </Select>
                          <span className="text-sm text-muted-foreground">
                            week{weekInterval > 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>

                      {customDays.length > 0 && (
                        <p className="text-sm text-muted-foreground">
                          Repeats on {customDays.map(d => DAYS_OF_WEEK.find(day => day.value === d)?.label).join(', ')}
                          {weekInterval > 1 ? ` every ${weekInterval} weeks` : ' every week'}
                        </p>
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
                  <Label>
                    {newAssignmentType === 'user' ? 'Employee' : 'Group'}
                  </Label>
                  <Select
                    value={newAssignmentTarget}
                    onValueChange={setNewAssignmentTarget}
                  >
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
                                <AvatarFallback className="text-xs">
                                  {employee.full_name?.[0] || 'U'}
                                </AvatarFallback>
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
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/tasks')}
          >
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {task ? t('common.save') : t('common.create')}
          </Button>
        </div>
      </form>
    </Form>
  );
}
