import { z } from 'zod';

export const FOOD_NOTE_REPLY_MAX_LENGTH = 10_000;

export const foodNoteResponseSchema = z.object({
  source: z.enum(['request', 'rating']),
  id: z.string().uuid(),
  noteRevision: z.string().uuid(),
  reply: z.string().trim().min(1).max(FOOD_NOTE_REPLY_MAX_LENGTH).nullable(),
});

export type FoodNoteResponseInput = z.infer<typeof foodNoteResponseSchema>;
