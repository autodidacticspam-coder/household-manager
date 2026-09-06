import { z } from 'zod';

export const FOOD_REQUEST_NOTES_MAX_LENGTH = 10_000;

export const updateFoodRequestNotesSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().trim().max(FOOD_REQUEST_NOTES_MAX_LENGTH),
  updatedAt: z.string().datetime({ offset: true }),
});

export type UpdateFoodRequestNotesInput = z.infer<typeof updateFoodRequestNotesSchema>;
