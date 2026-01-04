'use client';

import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { parseLocalDate } from '@/lib/date-utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatTime12h } from '@/lib/format-time';
import {
  Calendar,
  Clock,
  Users,
  Repeat,
  Video,
  ExternalLink,
  Play,
  CheckCircle,
  AlertCircle,
  User,
  Eye,
} from 'lucide-react';
import Image from 'next/image';
import type { TaskWithRelations } from '@/types';
import { getVideoThumbnail, getVideoPlatform } from '@/hooks/use-task-videos';

type TaskDetailDialogProps = {
  task: TaskWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (id: string) => void;
  onEdit?: (id: string) => void;
  showActions?: boolean;
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

export function TaskDetailDialog({
  task,
  open,
  onOpenChange,
  onComplete,
  onEdit,
  showActions = true,
}: TaskDetailDialogProps) {
  const t = useTranslations();

  if (!task) return null;

  const StatusIcon = statusIcons[task.status];

  const renderVideoItem = (video: {
    id: string;
    url: string;
    title: string | null;
    videoType: 'upload' | 'link';
  }) => {
    const thumbnail = getVideoThumbnail(video.url, video.videoType);
    const platform = video.videoType === 'link' ? getVideoPlatform(video.url) : null;

    // For uploaded videos, show an embedded video player
    if (video.videoType === 'upload') {
      return (
        <div key={video.id} className="space-y-2">
          <p className="text-sm font-medium">
            {video.title || 'Uploaded video'}
          </p>
          <video
            controls
            preload="metadata"
            className="w-full max-h-[400px] rounded-lg bg-black"
          >
            <source src={video.url} />
            Your browser does not support video playback.
          </video>
        </div>
      );
    }

    // For linked videos (YouTube, Vimeo, etc.), open in new tab
    return (
      <a
        key={video.id}
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors group"
      >
        <div className="flex-shrink-0 w-20 h-14 bg-muted rounded overflow-hidden flex items-center justify-center relative">
          {thumbnail ? (
            <Image
              src={thumbnail}
              alt={video.title || 'Video thumbnail'}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <Play className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate group-hover:text-blue-600">
            {video.title || 'Video link'}
          </p>
          {platform && (
            <p className="text-xs text-muted-foreground capitalize">
              {platform === 'youtube' ? 'YouTube' : platform === 'vimeo' ? 'Vimeo' : 'External link'}
            </p>
          )}
        </div>
        <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-blue-600 flex-shrink-0" />
      </a>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-3">
            {task.category && (
              <div
                className="w-4 h-4 rounded-full flex-shrink-0 mt-1"
                style={{ backgroundColor: task.category.color }}
              />
            )}
            <DialogTitle className="text-xl">{task.title}</DialogTitle>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Status and Priority badges */}
          <div className="flex flex-wrap gap-2">
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
                {t('tasks.recurring')}
              </Badge>
            )}
            {task.category && (
              <Badge variant="secondary">{task.category.name}</Badge>
            )}
          </div>

          {/* Description */}
          {task.description && (
            <div>
              <h4 className="text-sm font-medium mb-2">{t('tasks.description')}</h4>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {task.description}
              </p>
            </div>
          )}

          <Separator />

          {/* Due Date/Time */}
          {task.dueDate && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{t('tasks.dueDate')}:</span>
              <span>{format(parseLocalDate(task.dueDate), 'EEEE, MMMM d, yyyy')}</span>
              {task.dueTime && !task.isAllDay && (
                <span className="text-muted-foreground">
                  at {formatTime12h(task.dueTime)}
                </span>
              )}
              {task.isAllDay && (
                <Badge variant="outline" className="text-xs">
                  {t('tasks.allDay')}
                </Badge>
              )}
            </div>
          )}

          {/* Activity times */}
          {task.isActivity && task.startTime && task.endTime && (
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{t('tasks.activity')}:</span>
              <span>
                {formatTime12h(task.startTime)} - {formatTime12h(task.endTime)}
              </span>
            </div>
          )}

          {/* Assigned to */}
          {task.assignments && task.assignments.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t('tasks.assignedTo')}:</span>
              </div>
              <div className="flex flex-wrap gap-2 ml-6">
                {task.assignments.map((assignment, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 bg-muted/50 rounded-full px-3 py-1"
                  >
                    {assignment.targetType === 'user' && assignment.targetUser ? (
                      <>
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={assignment.targetUser.avatarUrl || undefined} />
                          <AvatarFallback className="text-xs">
                            {assignment.targetUser.fullName?.[0] || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{assignment.targetUser.fullName}</span>
                      </>
                    ) : assignment.targetType === 'group' && assignment.targetGroup ? (
                      <>
                        <Users className="h-4 w-4" />
                        <span className="text-sm">{assignment.targetGroup.name}</span>
                      </>
                    ) : assignment.targetType === 'all' ? (
                      <>
                        <Users className="h-4 w-4" />
                        <span className="text-sm">{t('tasks.assignmentTypes.all')}</span>
                      </>
                    ) : assignment.targetType === 'all_admins' ? (
                      <>
                        <User className="h-4 w-4" />
                        <span className="text-sm">{t('tasks.assignmentTypes.allAdmins')}</span>
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Viewable by */}
          {task.viewers && task.viewers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t('tasks.viewableBy')}:</span>
              </div>
              <div className="flex flex-wrap gap-2 ml-6">
                {task.viewers.map((viewer, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 bg-muted/50 rounded-full px-3 py-1"
                  >
                    {viewer.targetType === 'user' && viewer.targetUser ? (
                      <>
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={viewer.targetUser.avatarUrl || undefined} />
                          <AvatarFallback className="text-xs">
                            {viewer.targetUser.fullName?.[0] || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{viewer.targetUser.fullName}</span>
                      </>
                    ) : viewer.targetType === 'group' && viewer.targetGroup ? (
                      <>
                        <Users className="h-4 w-4" />
                        <span className="text-sm">{viewer.targetGroup.name}</span>
                      </>
                    ) : viewer.targetType === 'all' ? (
                      <>
                        <Users className="h-4 w-4" />
                        <span className="text-sm">{t('tasks.assignmentTypes.all')}</span>
                      </>
                    ) : viewer.targetType === 'all_admins' ? (
                      <>
                        <User className="h-4 w-4" />
                        <span className="text-sm">{t('tasks.assignmentTypes.allAdmins')}</span>
                      </>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Videos */}
          {task.videos && task.videos.length > 0 && (
            <>
              <Separator />
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Video className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{t('tasks.videos.title')}:</span>
                </div>
                <div className="space-y-2">
                  {task.videos.map((video) => renderVideoItem(video))}
                </div>
              </div>
            </>
          )}

          <Separator />

          {/* Meta info */}
          <div className="text-xs text-muted-foreground space-y-1">
            {task.createdByUser && (
              <p>
                Created by {task.createdByUser.fullName} on{' '}
                {format(new Date(task.createdAt), 'MMM d, yyyy')}
              </p>
            )}
            {task.completedByUser && task.completedAt && (
              <p>
                Completed by {task.completedByUser.fullName} on{' '}
                {format(new Date(task.completedAt), 'MMM d, yyyy')}
              </p>
            )}
          </div>

          {/* Action buttons */}
          {showActions && (
            <div className="flex justify-end gap-2 pt-2">
              {onEdit && (
                <Button variant="outline" onClick={() => onEdit(task.id)}>
                  {t('common.edit')}
                </Button>
              )}
              {onComplete && task.status !== 'completed' && (
                <Button onClick={() => onComplete(task.id)}>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {t('tasks.markComplete')}
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
