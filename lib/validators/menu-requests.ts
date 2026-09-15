import { z } from 'zod';
import { isDateOnly } from '@/lib/leave-dates';
import { MENU_DAYS, MENU_MEAL_TYPES, menuSwapSchema } from './menu-swap';

export const menuWeekSchema = z.string().refine(value => isDateOnly(value) && new Date(`${value}T12:00:00Z`).getUTCDay() === 1);
const version = z.string().datetime({ offset: true });
export const menuRequestSchema = menuSwapSchema.safeExtend({
  weekStart: menuWeekSchema,
  expectedUpdatedAt: version,
  note: z.string().trim().max(2000).default(''),
});
export const menuResponseSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(['accepted', 'rejected', 'cancelled']),
  reply: z.string().trim().max(2000).default(''),
});
export const saveMenuSchema = z.object({
  weekStart: menuWeekSchema,
  meals: z.array(z.object({
    day: z.enum(MENU_DAYS),
    breakfast: z.string().max(20000), lunch: z.string().max(20000),
    dinner: z.string().max(20000), snacks: z.string().max(20000),
  })).length(7).refine(meals => new Set(meals.map(day => day.day)).size === 7),
  notes: z.string().max(10000).nullable().optional(),
  expectedUpdatedAt: version.nullable(),
});

export const notificationDetailsSchema = z.object({
  changes: z.array(z.object({
    day: z.enum(MENU_DAYS), mealType: z.enum(MENU_MEAL_TYPES), before: z.string(), after: z.string(),
  })).default([]),
  notesBefore: z.string().nullable().default(null),
  notesAfter: z.string().nullable().default(null),
});
export type MenuRequestInput = z.infer<typeof menuRequestSchema>;
export type MenuResponseInput = z.infer<typeof menuResponseSchema>;
