import { z } from 'zod';

export const MENU_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const MENU_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;

export const menuSlotSchema = z.object({
  day: z.enum(MENU_DAYS),
  mealType: z.enum(MENU_MEAL_TYPES),
});

export const menuSwapSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  from: menuSlotSchema,
  to: menuSlotSchema,
  expectedUpdatedAt: z.string().nullable().optional(),
}).refine(({ from, to }) => !isSameMenuSlot(from, to));

export type MenuSlot = z.infer<typeof menuSlotSchema>;
export type MenuSwapInput = z.infer<typeof menuSwapSchema>;

export function isSameMenuSlot(a: MenuSlot, b: MenuSlot): boolean {
  return a.day === b.day && a.mealType === b.mealType;
}
