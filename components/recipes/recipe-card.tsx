'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Utensils, Send } from 'lucide-react';
import type { RecipeWithMedia } from '@/types/recipe';
import { getVideoThumbnail } from '@/hooks/use-recipe-media';

interface RecipeCardProps {
  recipe: RecipeWithMedia;
  onClick: (recipe: RecipeWithMedia) => void;
  onRequest: (recipe: RecipeWithMedia) => void;
}

export function RecipeCard({ recipe, onClick, onRequest }: RecipeCardProps) {
  const t = useTranslations();

  // Find hero image or first media item
  const heroMedia = recipe.media?.find(m => m.isHero) || recipe.media?.[0];

  // Get thumbnail URL
  let thumbnailUrl: string | null = null;
  if (heroMedia) {
    if (heroMedia.storageType === 'upload') {
      thumbnailUrl = heroMedia.url;
    } else if (heroMedia.mediaType === 'video') {
      thumbnailUrl = getVideoThumbnail(heroMedia.url);
    } else {
      thumbnailUrl = heroMedia.url;
    }
  }

  const totalTime = (recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0);

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
      onClick={() => onClick(recipe)}
    >
      {/* Hero Image */}
      <div className="aspect-video bg-muted relative overflow-hidden">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={recipe.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Utensils className="h-12 w-12 text-muted-foreground/50" />
          </div>
        )}
      </div>

      <CardContent className="p-4">
        <h3 className="font-semibold text-lg line-clamp-2 mb-2">{recipe.title}</h3>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {totalTime > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {totalTime} {t('recipes.minutes')}
              </span>
            )}
            {recipe.servings && (
              <span className="flex items-center gap-1">
                <Utensils className="h-4 w-4" />
                {recipe.servings}
              </span>
            )}
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation();
              onRequest(recipe);
            }}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
