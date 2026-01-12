'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, Search, Loader2 } from 'lucide-react';
import { RecipeCard } from '@/components/recipes/recipe-card';
import { RecipeDetailDialog } from '@/components/recipes/recipe-detail-dialog';
import { useRecipes } from '@/hooks/use-recipes';
import { useCreateFoodRequest } from '@/hooks/use-food-requests';
import type { RecipeWithMedia } from '@/types/recipe';

export default function RecipesPage() {
  const t = useTranslations();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeWithMedia | null>(null);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestRecipe, setRequestRecipe] = useState<RecipeWithMedia | null>(null);
  const [requestNotes, setRequestNotes] = useState('');

  const { data: recipes, isLoading } = useRecipes(debouncedSearch);
  const createFoodRequest = useCreateFoodRequest();

  // Debounce search
  const handleSearchChange = (value: string) => {
    setSearch(value);
    // Simple debounce
    setTimeout(() => {
      setDebouncedSearch(value);
    }, 300);
  };

  const handleRequestRecipe = (recipe: RecipeWithMedia) => {
    setRequestRecipe(recipe);
    setRequestNotes('');
    setRequestDialogOpen(true);
  };

  const handleSubmitRequest = async () => {
    if (!requestRecipe) return;

    await createFoodRequest.mutateAsync({
      foodName: requestRecipe.title,
      notes: requestNotes || undefined,
      recipeId: requestRecipe.id,
    });

    setRequestDialogOpen(false);
    setRequestRecipe(null);
    setRequestNotes('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('recipes.title')}</h1>
          <p className="text-muted-foreground">{t('recipes.description')}</p>
        </div>
        <Button onClick={() => router.push('/recipes/new')}>
          <Plus className="h-4 w-4 mr-2" />
          {t('recipes.addRecipe')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('recipes.searchRecipes')}
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Recipe Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="aspect-[4/3]" />
          ))}
        </div>
      ) : recipes && recipes.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {recipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onClick={setSelectedRecipe}
              onRequest={handleRequestRecipe}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('recipes.noRecipes')}</p>
          <Button
            variant="link"
            onClick={() => router.push('/recipes/new')}
            className="mt-2"
          >
            {t('recipes.addRecipe')}
          </Button>
        </div>
      )}

      {/* Recipe Detail Dialog */}
      <RecipeDetailDialog
        recipe={selectedRecipe}
        open={!!selectedRecipe}
        onOpenChange={(open) => !open && setSelectedRecipe(null)}
        onRequest={handleRequestRecipe}
      />

      {/* Request Dialog */}
      <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('recipes.requestThisDish')}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {requestRecipe && (
              <p className="font-medium">{requestRecipe.title}</p>
            )}
            <div className="space-y-2">
              <Label>{t('foodRequests.notes')} ({t('common.optional')})</Label>
              <Textarea
                value={requestNotes}
                onChange={(e) => setRequestNotes(e.target.value)}
                placeholder={t('foodRequests.notesPlaceholder')}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSubmitRequest}
              disabled={createFoodRequest.isPending}
            >
              {createFoodRequest.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {t('foodRequests.submitRequest')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
