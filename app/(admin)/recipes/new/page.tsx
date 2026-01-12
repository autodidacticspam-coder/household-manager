'use client';

import { useTranslations } from 'next-intl';
import { RecipeForm } from '@/components/recipes/recipe-form';

export default function NewRecipePage() {
  const t = useTranslations();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('recipes.addRecipe')}</h1>
        <p className="text-muted-foreground">{t('recipes.description')}</p>
      </div>

      <RecipeForm />
    </div>
  );
}
