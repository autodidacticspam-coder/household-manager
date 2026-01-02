'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Video, Link, Upload, X, Loader2, ExternalLink, Play } from 'lucide-react';
import { useUploadTaskVideo, useAddVideoLink, getVideoThumbnail, getVideoPlatform, type VideoInput } from '@/hooks/use-task-videos';
import type { TaskVideoType } from '@/types/task';
import { toast } from 'sonner';

// Common video interface that works for both TaskVideo and TemplateVideo
type VideoItem = {
  id: string;
  videoType: TaskVideoType;
  url: string;
  title: string | null;
};

type TaskVideosSectionProps = {
  existingVideos?: VideoItem[];
  pendingVideos: VideoInput[];
  onAddVideo: (video: VideoInput) => void;
  onRemoveVideo: (index: number) => void;
  onRemoveExistingVideo?: (videoId: string) => void;
};

export function TaskVideosSection({
  existingVideos = [],
  pendingVideos,
  onAddVideo,
  onRemoveVideo,
  onRemoveExistingVideo,
}: TaskVideosSectionProps) {
  const t = useTranslations('tasks.videos');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [deleteVideoId, setDeleteVideoId] = useState<string | null>(null);
  const [deletePendingIndex, setDeletePendingIndex] = useState<number | null>(null);

  const uploadVideo = useUploadTaskVideo();
  const addVideoLink = useAddVideoLink();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await uploadVideo.mutateAsync(file);
      onAddVideo(result);
      toast.success(t('uploadSuccess'));
    } catch {
      // Error is already handled in the hook
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAddLink = async () => {
    if (!linkUrl.trim()) return;

    try {
      const result = await addVideoLink.mutateAsync({
        url: linkUrl.trim(),
        title: linkTitle.trim() || undefined,
      });
      onAddVideo(result);
      toast.success(t('linkAdded'));
      setLinkUrl('');
      setLinkTitle('');
      setShowLinkInput(false);
    } catch {
      // Error is already handled in the hook
    }
  };

  const handleConfirmDelete = () => {
    if (deleteVideoId && onRemoveExistingVideo) {
      onRemoveExistingVideo(deleteVideoId);
    }
    if (deletePendingIndex !== null) {
      onRemoveVideo(deletePendingIndex);
    }
    setDeleteVideoId(null);
    setDeletePendingIndex(null);
  };

  const renderVideoItem = (
    url: string,
    title: string | null,
    videoType: 'upload' | 'link',
    onDelete: () => void,
    key: string
  ) => {
    const thumbnail = getVideoThumbnail(url, videoType);
    const platform = videoType === 'link' ? getVideoPlatform(url) : null;

    return (
      <div
        key={key}
        className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg group"
      >
        {/* Thumbnail or icon */}
        <div className="flex-shrink-0 w-16 h-12 bg-muted rounded overflow-hidden flex items-center justify-center">
          {thumbnail ? (
            <img
              src={thumbnail}
              alt={title || 'Video thumbnail'}
              className="w-full h-full object-cover"
            />
          ) : videoType === 'upload' ? (
            <Video className="h-5 w-5 text-muted-foreground" />
          ) : (
            <Play className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        {/* Title and platform */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {title || (videoType === 'upload' ? 'Uploaded video' : url)}
          </p>
          {platform && (
            <p className="text-xs text-muted-foreground capitalize">
              {platform === 'youtube' ? 'YouTube' : platform === 'vimeo' ? 'Vimeo' : 'Link'}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => window.open(url, '_blank')}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  const isUploading = uploadVideo.isPending;
  const isAddingLink = addVideoLink.isPending;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            {t('title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('description')}
          </p>

          {/* Existing videos */}
          {existingVideos.length > 0 && (
            <div className="space-y-2">
              {existingVideos.map((video) =>
                renderVideoItem(
                  video.url,
                  video.title,
                  video.videoType,
                  () => setDeleteVideoId(video.id),
                  `existing-${video.id}`
                )
              )}
            </div>
          )}

          {/* Pending videos */}
          {pendingVideos.length > 0 && (
            <div className="space-y-2">
              {pendingVideos.map((video, index) =>
                renderVideoItem(
                  video.url,
                  video.title || null,
                  video.videoType,
                  () => setDeletePendingIndex(index),
                  `pending-${index}`
                )
              )}
            </div>
          )}

          {/* Empty state */}
          {existingVideos.length === 0 && pendingVideos.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-sm">
              {t('noVideos')}
            </div>
          )}

          {/* Add link form */}
          {showLinkInput && (
            <div className="space-y-3 p-4 border rounded-lg bg-background">
              <div className="space-y-2">
                <Label>{t('videoUrl')}</Label>
                <Input
                  type="url"
                  placeholder={t('videoUrlPlaceholder')}
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('videoTitle')}</Label>
                <Input
                  placeholder={t('videoTitlePlaceholder')}
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowLinkInput(false);
                    setLinkUrl('');
                    setLinkTitle('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddLink}
                  disabled={!linkUrl.trim() || isAddingLink}
                >
                  {isAddingLink && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add
                </Button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska"
              onChange={handleFileSelect}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {isUploading ? t('uploading') : t('uploadVideo')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowLinkInput(true)}
              disabled={showLinkInput}
            >
              <Link className="h-4 w-4 mr-2" />
              {t('addLink')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <AlertDialog
        open={deleteVideoId !== null || deletePendingIndex !== null}
        onOpenChange={() => {
          setDeleteVideoId(null);
          setDeletePendingIndex(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteConfirmation')}</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
