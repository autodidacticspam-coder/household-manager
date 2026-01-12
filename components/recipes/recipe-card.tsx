'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Utensils, Send } from 'lucide-react';
import type { RecipeWithMedia } from '@/types/recipe';
import { getVideoThumbnail } from '@/hooks/use-recipe-media';

interface RecipeCardProps {
  recipe: RecipeWithMedia;
  onClick: (recipe: RecipeWithMedia) => void;
  onRequest: (recipe: RecipeWithMedia) => void;
}

export function RecipeCard({ recipe, onClick, onRequest }: RecipeCardProps) {
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
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-lg line-clamp-2 flex-1">{recipe.title}</h3>
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
