export type RecipeMediaType = 'image' | 'video';
export type RecipeStorageType = 'upload' | 'link';

export interface Ingredient {
  item: string;
  amount: string;
}

export interface Instruction {
  step: number;
  text: string;
}

export interface RecipeMedia {
  id: string;
  recipeId: string;
  mediaType: RecipeMediaType;
  storageType: RecipeStorageType;
  url: string;
  title: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  isHero: boolean;
  sortOrder: number;
  createdAt: string;
  createdBy: string | null;
}

export interface Recipe {
  id: string;
  title: string;
  titleEs: string | null;
  titleZh: string | null;
  description: string | null;
  descriptionEs: string | null;
  descriptionZh: string | null;
  ingredients: Ingredient[];
  instructions: Instruction[];
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  servings: number | null;
  sourceUrl: string | null;
  sourceName: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecipeWithMedia extends Recipe {
  media: RecipeMedia[];
}

// Input types for forms
export interface RecipeMediaInput {
  mediaType: RecipeMediaType;
  storageType: RecipeStorageType;
  url: string;
  title?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  isHero?: boolean;
}

export interface CreateRecipeInput {
  title: string;
  titleEs?: string;
  titleZh?: string;
  description?: string;
  descriptionEs?: string;
  descriptionZh?: string;
  ingredients?: Ingredient[];
  instructions?: Instruction[];
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  servings?: number;
  sourceUrl?: string;
  sourceName?: string;
  notes?: string;
  media?: RecipeMediaInput[];
}

export interface UpdateRecipeInput extends Partial<CreateRecipeInput> {
  id: string;
}
