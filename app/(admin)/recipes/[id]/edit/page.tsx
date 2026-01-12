'use client';

import { use } from 'react';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';
import { RecipeForm } from '@/components/recipes/recipe-form';
import { useRecipe } from '@/hooks/use-recipes';

interface EditRecipePageProps {
  params: Promise<{ id: string }>;
}

export default function EditRecipePage({ params }: EditRecipePageProps) {
  const { id } = use(params);
  const t = useTranslations();
  const { data: recipe, isLoading } = useRecipe(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!recipe) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Recipe not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('recipes.editRecipe')}</h1>
        <p className="text-muted-foreground">{recipe.title}</p>
      </div>

      <RecipeForm recipe={recipe} isEdit />
    </div>
  );
}
