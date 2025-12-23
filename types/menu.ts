export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export interface DayMeals {
  day: DayOfWeek;
  breakfast: string;
  lunch: string;
  dinner: string;
  snacks: string;
}

export interface WeeklyMenu {
  id: string;
  weekStart: string;
  meals: DayMeals[];
  notes: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  updatedByUser?: {
    id: string;
    fullName: string;
  } | null;
}

export interface UpdateMenuInput {
  meals: DayMeals[];
  notes?: string | null;
}
