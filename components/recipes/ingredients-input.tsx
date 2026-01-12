'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import type { Ingredient } from '@/types/recipe';

interface IngredientsInputProps {
  ingredients: Ingredient[];
  onChange: (ingredients: Ingredient[]) => void;
}

export function IngredientsInput({ ingredients, onChange }: IngredientsInputProps) {
  const t = useTranslations();

  const addIngredient = () => {
    onChange([...ingredients, { item: '', amount: '' }]);
  };

  const removeIngredient = (index: number) => {
    onChange(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{t('recipes.ingredients')}</Label>
        <Button type="button" variant="outline" size="sm" onClick={addIngredient}>
          <Plus className="h-4 w-4 mr-1" />
          {t('recipes.addIngredient')}
        </Button>
      </div>

      {ingredients.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No ingredients added yet. Click "Add Ingredient" to start.
        </p>
      ) : (
        <div className="space-y-2">
          {ingredients.map((ingredient, index) => (
            <div key={index} className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Input
                value={ingredient.amount}
                onChange={(e) => updateIngredient(index, 'amount', e.target.value)}
                placeholder={t('recipes.ingredientAmount')}
                className="w-28 flex-shrink-0"
              />
              <Input
                value={ingredient.item}
                onChange={(e) => updateIngredient(index, 'item', e.target.value)}
                placeholder={t('recipes.ingredientName')}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeIngredient(index)}
                className="flex-shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
