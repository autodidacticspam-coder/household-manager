'use client';

import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
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
import { cn } from '@/lib/utils';
import { MoreHorizontal, CheckCircle, Clock, AlertCircle, Calendar, Users, User, Repeat, FileText, Undo2 } from 'lucide-react';
import type { TaskWithRelations } from '@/types';

type TaskCardProps = {
  task: TaskWithRelations;
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
  onComplete,
  onUndo,
  onEdit,
  onDelete,
  showActions = true,
  isEmployee = false,
}: TaskCardProps) {
  const t = useTranslations();

  const StatusIcon = statusIcons[task.status];
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'completed';

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

  return (
    <Card className={cn(
      'transition-shadow hover:shadow-md',
      isOverdue && 'border-red-200 bg-red-50/30'
    )}>
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
              // Dropdown menu for admins
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
              {format(new Date(task.dueDate), 'EEE, MMM d')}
              {task.dueTime && !task.isAllDay && (
                <span className="ml-1">
                  at {task.dueTime.slice(0, 5)}
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
