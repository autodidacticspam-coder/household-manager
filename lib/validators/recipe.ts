import { z } from 'zod';

export const recipeMediaTypeSchema = z.enum(['image', 'video']);
export const recipeStorageTypeSchema = z.enum(['upload', 'link']);

export const ingredientSchema = z.object({
  item: z.string().min(1, 'Ingredient name is required'),
  amount: z.string(),
});

export const instructionSchema = z.object({
  step: z.number().min(1),
  text: z.string().min(1, 'Instruction text is required'),
});

export const recipeMediaInputSchema = z.object({
  mediaType: recipeMediaTypeSchema,
  storageType: recipeStorageTypeSchema,
  url: z.string().url(),
  title: z.string().optional(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  isHero: z.boolean().optional(),
});

export const createRecipeSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  titleEs: z.string().max(255).nullable().optional(),
  titleZh: z.string().max(255).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  descriptionEs: z.string().max(5000).nullable().optional(),
  descriptionZh: z.string().max(5000).nullable().optional(),
  ingredients: z.array(ingredientSchema).optional(),
  instructions: z.array(instructionSchema).optional(),
  prepTimeMinutes: z.number().min(0).nullable().optional(),
  cookTimeMinutes: z.number().min(0).nullable().optional(),
  servings: z.number().min(1).nullable().optional(),
  sourceUrl: z.string().url().nullable().optional().or(z.literal('')),
  sourceName: z.string().max(255).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  media: z.array(recipeMediaInputSchema).optional(),
});

export const updateRecipeSchema = createRecipeSchema.partial();
