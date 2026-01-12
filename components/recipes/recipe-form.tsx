'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { IngredientsInput } from './ingredients-input';
import { InstructionsInput } from './instructions-input';
import { RecipeMediaSection } from './recipe-media-section';
import { useCreateRecipe, useUpdateRecipe } from '@/hooks/use-recipes';
import type { RecipeWithMedia, Ingredient, Instruction, RecipeMediaInput } from '@/types/recipe';

interface RecipeFormProps {
  recipe?: RecipeWithMedia;
  isEdit?: boolean;
}

export function RecipeForm({ recipe, isEdit = false }: RecipeFormProps) {
  const t = useTranslations();
  const router = useRouter();

  const [title, setTitle] = useState(recipe?.title || '');
  const [description, setDescription] = useState(recipe?.description || '');
  const [ingredients, setIngredients] = useState<Ingredient[]>(recipe?.ingredients || []);
  const [instructions, setInstructions] = useState<Instruction[]>(recipe?.instructions || []);
  const [prepTimeMinutes, setPrepTimeMinutes] = useState<string>(recipe?.prepTimeMinutes?.toString() || '');
  const [cookTimeMinutes, setCookTimeMinutes] = useState<string>(recipe?.cookTimeMinutes?.toString() || '');
  const [servings, setServings] = useState<string>(recipe?.servings?.toString() || '');
  const [sourceUrl, setSourceUrl] = useState(recipe?.sourceUrl || '');
  const [sourceName, setSourceName] = useState(recipe?.sourceName || '');
  const [notes, setNotes] = useState(recipe?.notes || '');

  // Media state
  const [existingMedia, setExistingMedia] = useState<RecipeMediaInput[]>(
    recipe?.media?.map(m => ({
      mediaType: m.mediaType,
      storageType: m.storageType,
      url: m.url,
      title: m.title || undefined,
      fileName: m.fileName || undefined,
      fileSize: m.fileSize || undefined,
      mimeType: m.mimeType || undefined,
      isHero: m.isHero,
    })) || []
  );
  const [pendingMedia, setPendingMedia] = useState<RecipeMediaInput[]>([]);

  const createRecipe = useCreateRecipe();
  const updateRecipe = useUpdateRecipe();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const allMedia = [...existingMedia, ...pendingMedia];

    // Ensure at least one media is marked as hero
    if (allMedia.length > 0 && !allMedia.some(m => m.isHero)) {
      allMedia[0].isHero = true;
    }

    const data = {
      title,
      description: description || undefined,
      ingredients,
      instructions,
      prepTimeMinutes: prepTimeMinutes ? parseInt(prepTimeMinutes) : undefined,
      cookTimeMinutes: cookTimeMinutes ? parseInt(cookTimeMinutes) : undefined,
      servings: servings ? parseInt(servings) : undefined,
      sourceUrl: sourceUrl || undefined,
      sourceName: sourceName || undefined,
      notes: notes || undefined,
      media: allMedia,
    };

    try {
      if (isEdit && recipe) {
        await updateRecipe.mutateAsync({ id: recipe.id, ...data });
      } else {
        await createRecipe.mutateAsync(data);
      }
      router.push('/recipes');
    } catch {
      // Error handled by mutation
    }
  };

  const handleAddMedia = (media: RecipeMediaInput) => {
    setPendingMedia([...pendingMedia, media]);
  };

  const handleRemoveMedia = (index: number) => {
    setPendingMedia(pendingMedia.filter((_, i) => i !== index));
  };

  const handleRemoveExistingMedia = (index: number) => {
    setExistingMedia(existingMedia.filter((_, i) => i !== index));
  };

  const handleSetHero = (index: number, isExisting: boolean) => {
    // Clear all hero flags
    const updatedExisting = existingMedia.map(m => ({ ...m, isHero: false }));
    const updatedPending = pendingMedia.map(m => ({ ...m, isHero: false }));

    // Set the selected one as hero
    if (isExisting) {
      updatedExisting[index].isHero = true;
    } else {
      updatedPending[index].isHero = true;
    }

    setExistingMedia(updatedExisting);
    setPendingMedia(updatedPending);
  };

  const isSubmitting = createRecipe.isPending || updateRecipe.isPending;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('recipes.recipeTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">{t('recipes.recipeTitle')} *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Grandma's Apple Pie"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('recipes.recipeDescription')}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of the recipe..."
              rows={3}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prepTime">{t('recipes.prepTime')}</Label>
              <Input
                id="prepTime"
                type="number"
                min="0"
                value={prepTimeMinutes}
                onChange={(e) => setPrepTimeMinutes(e.target.value)}
                placeholder="15"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cookTime">{t('recipes.cookTime')}</Label>
              <Input
                id="cookTime"
                type="number"
                min="0"
                value={cookTimeMinutes}
                onChange={(e) => setCookTimeMinutes(e.target.value)}
                placeholder="30"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="servings">{t('recipes.servings')}</Label>
              <Input
                id="servings"
                type="number"
                min="1"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                placeholder="4"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('recipes.ingredients')}</CardTitle>
        </CardHeader>
        <CardContent>
          <IngredientsInput
            ingredients={ingredients}
            onChange={setIngredients}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('recipes.instructions')}</CardTitle>
        </CardHeader>
        <CardContent>
          <InstructionsInput
            instructions={instructions}
            onChange={setInstructions}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('recipes.media.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <RecipeMediaSection
            existingMedia={existingMedia.map((m, i) => ({
              id: `existing-${i}`,
              recipeId: recipe?.id || '',
              mediaType: m.mediaType,
              storageType: m.storageType,
              url: m.url,
              title: m.title || null,
              fileName: m.fileName || null,
              fileSize: m.fileSize || null,
              mimeType: m.mimeType || null,
              isHero: m.isHero || false,
              sortOrder: i,
              createdAt: '',
              createdBy: null,
            }))}
            pendingMedia={pendingMedia}
            onAddMedia={handleAddMedia}
            onRemoveMedia={handleRemoveMedia}
            onRemoveExistingMedia={(id) => {
              const index = parseInt(id.replace('existing-', ''));
              handleRemoveExistingMedia(index);
            }}
            onSetHero={handleSetHero}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('recipes.sourceUrl')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sourceUrl">{t('recipes.sourceUrl')}</Label>
            <Input
              id="sourceUrl"
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder={t('recipes.sourceUrlPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sourceName">{t('recipes.sourceName')}</Label>
            <Input
              id="sourceName"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder={t('recipes.sourceNamePlaceholder')}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('recipes.notes')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('recipes.notesPlaceholder')}
            rows={4}
          />
        </CardContent>
      </Card>

      <div className="flex gap-4 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/recipes')}
        >
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={!title || isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          {isEdit ? t('common.save') : t('recipes.addRecipe')}
        </Button>
      </div>
    </form>
  );
}
