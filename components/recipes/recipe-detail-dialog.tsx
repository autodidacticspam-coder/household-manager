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
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Clock,
  Utensils,
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
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!recipe) return null;

  const heroMedia = recipe.media?.find(m => m.isHero) || recipe.media?.[0];
  const mediaCount = recipe.media?.length || 0;
  const currentMedia = recipe.media?.[currentMediaIndex] || heroMedia;

  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

  const handleEdit = () => {
    onOpenChange(false);
    router.push(`/recipes/${recipe.id}/edit`);
  };

  const handleDelete = async () => {
    await deleteRecipe.mutateAsync(recipe.id);
    setShowDeleteConfirm(false);
    onOpenChange(false);
  };

  const toggleIngredient = (index: number) => {
    const newChecked = new Set(checkedIngredients);
    if (newChecked.has(index)) {
      newChecked.delete(index);
    } else {
      newChecked.add(index);
    }
    setCheckedIngredients(newChecked);
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
                {recipe.description && (
                  <p className="text-muted-foreground">{recipe.description}</p>
                )}
              </DialogHeader>

              {/* Meta Info */}
              <div className="flex flex-wrap gap-4 text-sm">
                {recipe.prepTimeMinutes && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Prep: {recipe.prepTimeMinutes} {t('recipes.minutes')}</span>
                  </div>
                )}
                {recipe.cookTimeMinutes && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Cook: {recipe.cookTimeMinutes} {t('recipes.minutes')}</span>
                  </div>
                )}
                {totalTime > 0 && (
                  <div className="flex items-center gap-1 font-medium">
                    <Clock className="h-4 w-4" />
                    <span>Total: {totalTime} {t('recipes.minutes')}</span>
                  </div>
                )}
                {recipe.servings && (
                  <div className="flex items-center gap-1">
                    <Utensils className="h-4 w-4 text-muted-foreground" />
                    <span>{recipe.servings} {t('recipes.servings')}</span>
                  </div>
                )}
              </div>

              {/* Ingredients */}
              {recipe.ingredients && recipe.ingredients.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">{t('recipes.ingredients')}</h3>
                  <ul className="space-y-2">
                    {recipe.ingredients.map((ingredient, index) => (
                      <li key={index} className="flex items-center gap-3">
                        <Checkbox
                          id={`ingredient-${index}`}
                          checked={checkedIngredients.has(index)}
                          onCheckedChange={() => toggleIngredient(index)}
                        />
                        <label
                          htmlFor={`ingredient-${index}`}
                          className={`flex-1 cursor-pointer ${
                            checkedIngredients.has(index) ? 'line-through text-muted-foreground' : ''
                          }`}
                        >
                          {ingredient.amount && (
                            <span className="font-medium">{ingredient.amount}</span>
                          )}{' '}
                          {ingredient.item}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Instructions */}
              {recipe.instructions && recipe.instructions.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg">{t('recipes.instructions')}</h3>
                  <ol className="space-y-4">
                    {recipe.instructions.map((instruction) => (
                      <li key={instruction.step} className="flex gap-3">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
                          {instruction.step}
                        </span>
                        <p className="flex-1 pt-0.5">{instruction.text}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Notes */}
              {recipe.notes && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-lg">{t('recipes.notes')}</h3>
                  <p className="text-muted-foreground whitespace-pre-wrap">{recipe.notes}</p>
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
