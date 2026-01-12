'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { ImagePlus, Video, Link as LinkIcon, Trash2, Star, Loader2, ExternalLink } from 'lucide-react';
import {
  useUploadRecipeImage,
  useUploadRecipeVideo,
  useAddRecipeMediaLink,
  getVideoThumbnail,
  getVideoPlatform,
} from '@/hooks/use-recipe-media';
import type { RecipeMedia, RecipeMediaInput } from '@/types/recipe';

interface RecipeMediaSectionProps {
  existingMedia?: RecipeMedia[];
  pendingMedia: RecipeMediaInput[];
  onAddMedia: (media: RecipeMediaInput) => void;
  onRemoveMedia: (index: number) => void;
  onRemoveExistingMedia?: (mediaId: string) => void;
  onSetHero?: (index: number, isExisting: boolean) => void;
}

export function RecipeMediaSection({
  existingMedia = [],
  pendingMedia,
  onAddMedia,
  onRemoveMedia,
  onRemoveExistingMedia,
  onSetHero,
}: RecipeMediaSectionProps) {
  const t = useTranslations();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [deleteIndex, setDeleteIndex] = useState<{ index: number; isExisting: boolean } | null>(null);

  const uploadImage = useUploadRecipeImage();
  const uploadVideo = useUploadRecipeVideo();
  const addLink = useAddRecipeMediaLink();

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await uploadImage.mutateAsync(file);
      onAddMedia(result);
    } catch {
      // Error handled by mutation
    }

    // Reset input
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await uploadVideo.mutateAsync(file);
      onAddMedia(result);
    } catch {
      // Error handled by mutation
    }

    // Reset input
    if (videoInputRef.current) {
      videoInputRef.current.value = '';
    }
  };

  const handleAddLink = async () => {
    if (!linkUrl) return;

    try {
      const result = await addLink.mutateAsync({ url: linkUrl, title: linkTitle });
      onAddMedia(result);
      setLinkDialogOpen(false);
      setLinkUrl('');
      setLinkTitle('');
    } catch {
      // Error handled by mutation
    }
  };

  const handleDelete = () => {
    if (!deleteIndex) return;

    if (deleteIndex.isExisting) {
      const media = existingMedia[deleteIndex.index];
      if (media && onRemoveExistingMedia) {
        onRemoveExistingMedia(media.id);
      }
    } else {
      onRemoveMedia(deleteIndex.index);
    }
    setDeleteIndex(null);
  };

  const isUploading = uploadImage.isPending || uploadVideo.isPending;

  const getThumbnail = (media: RecipeMediaInput | RecipeMedia): string | null => {
    if (media.storageType === 'upload') {
      return media.url;
    }
    if (media.mediaType === 'video') {
      return getVideoThumbnail(media.url);
    }
    return media.url;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>{t('recipes.media.title')}</Label>
        <div className="flex gap-2">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelect}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleVideoSelect}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => imageInputRef.current?.click()}
            disabled={isUploading}
          >
            {uploadImage.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <ImagePlus className="h-4 w-4 mr-2" />
            )}
            {t('recipes.media.uploadImage')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => videoInputRef.current?.click()}
            disabled={isUploading}
          >
            {uploadVideo.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Video className="h-4 w-4 mr-2" />
            )}
            {t('recipes.media.uploadVideo')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLinkDialogOpen(true)}
            disabled={isUploading}
          >
            <LinkIcon className="h-4 w-4 mr-2" />
            {t('recipes.media.addLink')}
          </Button>
        </div>
      </div>

      {/* Media Grid */}
      {existingMedia.length === 0 && pendingMedia.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {t('recipes.media.noMedia')}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {/* Existing Media */}
          {existingMedia.map((media, index) => (
            <div
              key={media.id}
              className="relative aspect-video bg-muted rounded-lg overflow-hidden group"
            >
              {getThumbnail(media) ? (
                <img
                  src={getThumbnail(media)!}
                  alt={media.title || ''}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {media.mediaType === 'video' ? (
                    <Video className="h-8 w-8 text-muted-foreground" />
                  ) : (
                    <ImagePlus className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
              )}

              {/* Badges */}
              <div className="absolute top-2 left-2 flex gap-1">
                {media.isHero && (
                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                    <Star className="h-3 w-3 mr-1" />
                    Cover
                  </Badge>
                )}
                {media.mediaType === 'video' && (
                  <Badge variant="secondary">
                    {getVideoPlatform(media.url) || 'Video'}
                  </Badge>
                )}
              </div>

              {/* Actions */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {media.storageType === 'link' && (
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    onClick={() => window.open(media.url, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
                {onSetHero && !media.isHero && (
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    onClick={() => onSetHero(index, true)}
                  >
                    <Star className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  onClick={() => setDeleteIndex({ index, isExisting: true })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {/* Pending Media */}
          {pendingMedia.map((media, index) => (
            <div
              key={`pending-${index}`}
              className="relative aspect-video bg-muted rounded-lg overflow-hidden group border-2 border-dashed border-primary/50"
            >
              {getThumbnail(media) ? (
                <img
                  src={getThumbnail(media)!}
                  alt={media.title || ''}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {media.mediaType === 'video' ? (
                    <Video className="h-8 w-8 text-muted-foreground" />
                  ) : (
                    <ImagePlus className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
              )}

              {/* Badges */}
              <div className="absolute top-2 left-2 flex gap-1">
                <Badge variant="outline" className="bg-white/80">New</Badge>
                {media.mediaType === 'video' && media.storageType === 'link' && (
                  <Badge variant="secondary">
                    {getVideoPlatform(media.url) || 'Video'}
                  </Badge>
                )}
              </div>

              {/* Actions */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {media.storageType === 'link' && (
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    onClick={() => window.open(media.url, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                )}
                {onSetHero && (
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    onClick={() => onSetHero(index, false)}
                  >
                    <Star className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="destructive"
                  onClick={() => setDeleteIndex({ index, isExisting: false })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Link Dialog */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('recipes.media.addLink')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('recipes.sourceUrl')}</Label>
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder={t('recipes.sourceUrlPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('recipes.media.title')} ({t('common.optional')})</Label>
              <Input
                value={linkTitle}
                onChange={(e) => setLinkTitle(e.target.value)}
                placeholder="e.g., Recipe walkthrough video"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleAddLink} disabled={!linkUrl || addLink.isPending}>
              {addLink.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteIndex} onOpenChange={() => setDeleteIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('recipes.deleteConfirmation')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
