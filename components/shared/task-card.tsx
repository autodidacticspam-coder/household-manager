'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { format, startOfDay, isBefore } from 'date-fns';
import { parseLocalDate } from '@/lib/date-utils';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatTime12h } from '@/lib/format-time';
import { MoreHorizontal, CheckCircle, Clock, AlertCircle, Calendar, Users, Repeat, Undo2, UserPlus, Loader2, Video, ExternalLink } from 'lucide-react';
import { useEmployees, useQuickAssign } from '@/hooks/use-tasks';
import type { TaskWithRelations } from '@/types';

type TaskCardProps = {
  task: TaskWithRelations;
  onClick?: (task: TaskWithRelations) => void;
  onComplete?: (id: string) => void;
  onUndo?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  showActions?: boolean;
  isEmployee?: boolean;
};

const priorityColors = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

const statusColors = {
  pending: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
};

const statusIcons = {
  pending: Clock,
  in_progress: AlertCircle,
  completed: CheckCircle,
};

export function TaskCard({
  task,
  onClick,
  onComplete,
  onUndo,
  onEdit,
  onDelete,
  showActions = true,
  isEmployee = false,
}: TaskCardProps) {
  const t = useTranslations();
  const { data: employees } = useEmployees();
  const quickAssign = useQuickAssign();
  const [quickAssignOpen, setQuickAssignOpen] = useState(false);

  const StatusIcon = statusIcons[task.status];

  const handleQuickAssign = async (userId: string) => {
    await quickAssign.mutateAsync({ taskId: task.id, userId });
    setQuickAssignOpen(false);
  };

  // Filter out already assigned users
  const assignedUserIds = task.assignments
    ?.filter(a => a.targetType === 'user' && a.targetUserId)
    .map(a => a.targetUserId) || [];
  const availableEmployees = employees?.filter(e => !assignedUserIds.includes(e.id)) || [];

  // Check if task is overdue
  // For recurring tasks, don't show as overdue if due date is from a previous day
  const isOverdue = (() => {
    if (!task.dueDate || task.status === 'completed') return false;

    const dueDate = parseLocalDate(task.dueDate);
    const now = new Date();

    // If the task is recurring and the due date is before today, don't show as overdue
    if (task.isRecurring && isBefore(startOfDay(dueDate), startOfDay(now))) {
      return false;
    }

    // Otherwise, show as overdue if due date has passed
    return dueDate < now;
  })();

  const getAllAssignees = (): Array<{ type: string; name: string; avatar?: string | null }> => {
    if (!task.assignments || task.assignments.length === 0) return [];

    return task.assignments.map(assignment => {
      if (assignment.targetType === 'all') {
        return { type: 'all', name: t('tasks.assignmentTypes.all') };
      }
      if (assignment.targetType === 'all_admins') {
        return { type: 'all_admins', name: t('tasks.assignmentTypes.allAdmins') };
      }
      if (assignment.targetType === 'group' && assignment.targetGroup) {
        return { type: 'group', name: assignment.targetGroup.name };
      }
      if (assignment.targetType === 'user' && assignment.targetUser) {
        return {
          type: 'user',
          name: assignment.targetUser.fullName || 'Unknown',
          avatar: assignment.targetUser.avatarUrl
        };
      }
      return null;
    }).filter((item): item is { type: string; name: string; avatar?: string | null } => item !== null);
  };

  const assignees = getAllAssignees();

  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger if clicking on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('[role="menuitem"]')) {
      return;
    }
    onClick?.(task);
  };

  return (
    <Card 
      className={cn(
        'transition-shadow hover:shadow-md',
        isOverdue && 'border-red-200 bg-red-50/30',
        onClick && 'cursor-pointer'
      )}
      onClick={handleCardClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {task.category && (
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: task.category.color }}
                />
              )}
              <h3 className="font-semibold text-sm truncate">{task.title}</h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={priorityColors[task.priority]}>
                {t(`tasks.priorities.${task.priority}`)}
              </Badge>
              <Badge variant="outline" className={statusColors[task.status]}>
                <StatusIcon className="h-3 w-3 mr-1" />
                {t(`tasks.${task.status}`)}
              </Badge>
              {task.isRecurring && (
                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                  <Repeat className="h-3 w-3 mr-1" />
                  Recurring
                </Badge>
              )}
              {isOverdue && (
                <Badge variant="destructive">
                  {t('tasks.overdue')}
                </Badge>
              )}
            </div>
          </div>

          {showActions && (
            isEmployee ? (
              // Direct button for employees
              task.status === 'completed' ? (
                onUndo && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-shrink-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                    onClick={() => onUndo(task.id)}
                  >
                    <Undo2 className="h-4 w-4 mr-1" />
                    Undo
                  </Button>
                )
              ) : (
                onComplete && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-shrink-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                    onClick={() => onComplete(task.id)}
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Complete
                  </Button>
                )
              )
            ) : (
              // Dropdown menu and quick assign for admins
              <div className="flex items-center gap-1">
                {availableEmployees.length > 0 && (
                  <Popover open={quickAssignOpen} onOpenChange={setQuickAssignOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" title={t('tasks.quickAssign')}>
                        <UserPlus className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-0" align="end">
                      <div className="p-2 border-b">
                        <p className="text-sm font-medium">{t('tasks.quickAssign')}</p>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {availableEmployees.map((employee) => (
                          <button
                            key={employee.id}
                            className="flex items-center gap-2 w-full p-2 hover:bg-muted text-left"
                            onClick={() => handleQuickAssign(employee.id)}
                            disabled={quickAssign.isPending}
                          >
                            {quickAssign.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Avatar className="h-6 w-6">
                                <AvatarImage src={employee.avatar_url || undefined} />
                                <AvatarFallback className="text-xs">
                                  {employee.full_name?.[0] || 'U'}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <span className="text-sm truncate">{employee.full_name}</span>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {task.status !== 'completed' && onComplete && (
                      <DropdownMenuItem onClick={() => onComplete(task.id)}>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {t('tasks.markComplete')}
                      </DropdownMenuItem>
                    )}
                    {onEdit && (
                      <DropdownMenuItem onClick={() => onEdit(task.id)}>
                        {t('common.edit')}
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onDelete(task.id)}
                          className="text-red-600 focus:text-red-600"
                        >
                          {t('common.delete')}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {task.description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {task.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4 text-sm">
          {task.dueDate && (
            <div className={cn(
              'flex items-center',
              isOverdue ? 'text-red-600' : 'text-muted-foreground'
            )}>
              <Calendar className="h-4 w-4 mr-1" />
              {format(parseLocalDate(task.dueDate), 'EEE, MMM d')}
              {task.dueTime && !task.isAllDay && (
                <span className="ml-1">
                  at {formatTime12h(task.dueTime)}
                </span>
              )}
            </div>
          )}

          {task.category && (
            <Badge variant="secondary" className="text-xs">
              {task.category.name}
            </Badge>
          )}
        </div>

        {/* Assignees section */}
        {assignees.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">Assigned to:</p>
            <div className="flex flex-wrap gap-2">
              {assignees.map((assignee, i) => (
                <div key={i} className="flex items-center text-sm">
                  {assignee.type === 'user' ? (
                    <Avatar className="h-5 w-5 mr-1">
                      <AvatarImage src={assignee.avatar || undefined} />
                      <AvatarFallback className="text-xs">
                        {assignee.name[0] || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <Users className="h-4 w-4 mr-1 text-muted-foreground" />
                  )}
                  <span className="text-muted-foreground">{assignee.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Videos section */}
        {task.videos && task.videos.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">Videos:</p>
            <div className="flex flex-col gap-2">
              {task.videos.map((video) => (
                <a
                  key={video.id}
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                >
                  <Video className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{video.title || (video.videoType === 'upload' ? 'Uploaded video' : 'Video link')}</span>
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Created date */}
        {task.createdAt && (
          <div className="text-xs text-muted-foreground pt-2 border-t">
            Created {format(new Date(task.createdAt), 'MMM d, yyyy')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
