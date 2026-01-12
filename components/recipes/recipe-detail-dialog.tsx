'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ExternalLink,
  Pencil,
  Trash2,
  Send,
  ChevronLeft,
  ChevronRight,
  Play,
} from 'lucide-react';
import { useDeleteRecipe } from '@/hooks/use-recipes';
import { getVideoThumbnail, getVideoPlatform } from '@/hooks/use-recipe-media';
import type { RecipeWithMedia } from '@/types/recipe';

interface RecipeDetailDialogProps {
  recipe: RecipeWithMedia | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequest: (recipe: RecipeWithMedia) => void;
}

export function RecipeDetailDialog({
  recipe,
  open,
  onOpenChange,
  onRequest,
}: RecipeDetailDialogProps) {
  const t = useTranslations();
  const router = useRouter();
  const deleteRecipe = useDeleteRecipe();

  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!recipe) return null;

  const heroMedia = recipe.media?.find(m => m.isHero) || recipe.media?.[0];
  const mediaCount = recipe.media?.length || 0;
  const currentMedia = recipe.media?.[currentMediaIndex] || heroMedia;

  const handleEdit = () => {
    onOpenChange(false);
    router.push(`/recipes/${recipe.id}/edit`);
  };

  const handleDelete = async () => {
    await deleteRecipe.mutateAsync(recipe.id);
    setShowDeleteConfirm(false);
    onOpenChange(false);
  };

  const getThumbnail = (media: typeof currentMedia): string | null => {
    if (!media) return null;
    if (media.storageType === 'upload') {
      return media.url;
    }
    if (media.mediaType === 'video') {
      return getVideoThumbnail(media.url);
    }
    return media.url;
  };

  const prevMedia = () => {
    setCurrentMediaIndex((prev) => (prev > 0 ? prev - 1 : mediaCount - 1));
  };

  const nextMedia = () => {
    setCurrentMediaIndex((prev) => (prev < mediaCount - 1 ? prev + 1 : 0));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0 overflow-hidden">
          {/* Media Carousel */}
          {mediaCount > 0 && currentMedia && (
            <div className="relative aspect-video bg-muted">
              {currentMedia.mediaType === 'video' && currentMedia.storageType === 'upload' ? (
                <video
                  src={currentMedia.url}
                  controls
                  className="w-full h-full object-contain"
                />
              ) : (
                <>
                  <img
                    src={getThumbnail(currentMedia) || ''}
                    alt={currentMedia.title || recipe.title}
                    className="w-full h-full object-cover"
                  />
                  {currentMedia.mediaType === 'video' && currentMedia.storageType === 'link' && (
                    <a
                      href={currentMedia.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
                    >
                      <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                        <Play className="h-8 w-8 text-primary ml-1" />
                      </div>
                    </a>
                  )}
                </>
              )}

              {/* Media Navigation */}
              {mediaCount > 1 && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
                    onClick={prevMedia}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white"
                    onClick={nextMedia}
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                    {recipe.media?.map((_, index) => (
                      <button
                        key={index}
                        className={`w-2 h-2 rounded-full transition-colors ${
                          index === currentMediaIndex ? 'bg-white' : 'bg-white/50'
                        }`}
                        onClick={() => setCurrentMediaIndex(index)}
                      />
                    ))}
                  </div>
                </>
              )}

              {/* Video platform badge */}
              {currentMedia.mediaType === 'video' && currentMedia.storageType === 'link' && (
                <Badge className="absolute top-2 right-2 bg-black/50">
                  {getVideoPlatform(currentMedia.url) || 'Video'}
                </Badge>
              )}
            </div>
          )}

          <ScrollArea className="max-h-[50vh]">
            <div className="p-6 space-y-6">
              <DialogHeader>
                <DialogTitle className="text-2xl">{recipe.title}</DialogTitle>
              </DialogHeader>

              {/* Description */}
              {recipe.description && (
                <div className="whitespace-pre-wrap text-sm font-mono bg-muted/50 p-4 rounded-lg">
                  {recipe.description}
                </div>
              )}

              {/* Source */}
              {recipe.sourceUrl && (
                <div className="pt-2">
                  <a
                    href={recipe.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {recipe.sourceName || t('recipes.sourceUrl')}
                  </a>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-4 border-t">
                <Button onClick={() => onRequest(recipe)}>
                  <Send className="h-4 w-4 mr-2" />
                  {t('recipes.requestThisDish')}
                </Button>
                <Button variant="outline" onClick={handleEdit}>
                  <Pencil className="h-4 w-4 mr-2" />
                  {t('common.edit')}
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {t('common.delete')}
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('recipes.deleteRecipe')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('recipes.deleteConfirmation')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
