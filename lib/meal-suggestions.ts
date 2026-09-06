import { canonicalizeFoodName, normalizeFoodName, type FoodNameMergeLike } from '@/lib/food-names';

export type MealRatingSignal = { menu_item: string; rating: number; rated_by: string | null };
export type MealRequestSignal = { food_name: string; status: string | null; completed_at: string | null; requested_by: string | null };
export type MealSuggestion = {
  name: string;
  averageRating: number | null;
  ratingCount: number;
  raterCount: number;
  requestCount: number;
  requesterCount: number;
  pendingCount: number;
  lastCompletedAt: string | null;
  recentlyCompleted: boolean;
  score: number;
};

/** Uses recorded completions only. A weekly plan is deliberately not an input. */
export function suggestMeals({ ratings, requests, merges = [], now = new Date(), limit = 6, allowedNames }: {
  ratings: MealRatingSignal[];
  requests: MealRequestSignal[];
  merges?: FoodNameMergeLike[];
  now?: Date;
  limit?: number;
  allowedNames?: string[];
}): MealSuggestion[] {
  const canonical = (name: string) => canonicalizeFoodName(name.trim(), merges);
  const key = (name: string) => normalizeFoodName(canonical(name));
  const allowed = allowedNames && new Set(allowedNames.map(key));
  type Group = { name: string; ratings: number[]; raters: Map<string, number[]>; requests: number; requesters: Set<string>; pending: number; completed: string | null };
  const groups = new Map<string, Group>();
  const groupFor = (name: string) => {
    const id = key(name);
    if (!id || (allowed && !allowed.has(id))) return undefined;
    if (!groups.has(id)) groups.set(id, { name: canonical(name), ratings: [], raters: new Map(), requests: 0, requesters: new Set(), pending: 0, completed: null });
    return groups.get(id)!;
  };
  for (const rating of ratings) {
    if (!Number.isFinite(rating.rating) || rating.rating < 1 || rating.rating > 10) continue;
    const group = groupFor(rating.menu_item);
    if (!group) continue;
    group.ratings.push(rating.rating);
    // One prolific rater must not overwhelm everyone else in the ranking.
    const rater = rating.rated_by || 'unknown';
    group.raters.set(rater, [...(group.raters.get(rater) || []), rating.rating]);
  }
  const currentTime = now.getTime();
  for (const request of requests) {
    if (request.status !== 'pending' && request.status !== 'completed') continue;
    const group = groupFor(request.food_name);
    if (!group) continue;
    group.requests++;
    if (request.requested_by) group.requesters.add(request.requested_by);
    if (request.status === 'pending') group.pending++;
    if (request.status === 'completed' && request.completed_at) {
      const completedTime = Date.parse(request.completed_at);
      if (Number.isFinite(completedTime) && completedTime <= currentTime && (!group.completed || completedTime > Date.parse(group.completed))) group.completed = request.completed_at;
    }
  }
  const ranked = [...groups.values()].flatMap((group): MealSuggestion[] => {
    const daysSinceCompletion = group.completed ? (currentTime - Date.parse(group.completed)) / 86_400_000 : null;
    const recent = daysSinceCompletion !== null && daysSinceCompletion < 7;
    const averages = [...group.raters.values()].map(values => values.reduce((sum, value) => sum + value, 0) / values.length);
    const balancedRating = averages.length ? averages.reduce((sum, value) => sum + value, 0) / averages.length : 0;
    // Keep fresh requests visible, even if someone has requested a recent repeat.
    if (!group.pending && (recent || (balancedRating < 7 && group.requests < 2))) return [];
    const adjustedRating = (balancedRating * averages.length + 6 * 3) / (averages.length + 3);
    const score = (group.pending ? 20 + Math.min(group.pending, 5) * 3 : 0) + adjustedRating
      + Math.log2(1 + group.requests) + Math.min(group.requesters.size, 3)
      + (daysSinceCompletion === null ? 0 : Math.min(daysSinceCompletion, 30) / 30);
    return [{ name: group.name, averageRating: group.ratings.length ? group.ratings.reduce((a,b) => a+b, 0) / group.ratings.length : null,
      ratingCount: group.ratings.length, raterCount: [...group.raters.keys()].filter(id => id !== 'unknown').length,
      requestCount: group.requests, requesterCount: group.requesters.size, pendingCount: group.pending,
      lastCompletedAt: group.completed, recentlyCompleted: recent, score }];
  }).sort((a,b) => b.score-a.score || a.name.localeCompare(b.name));
  const count = Math.max(0, Math.floor(limit));
  const pending = ranked.filter(item => item.pendingCount > 0);
  const favorites = ranked.filter(item => item.pendingCount === 0);
  // Reserve space for other ideas when the household has a long request queue.
  const chosen = [...pending.slice(0, Math.ceil(count/2)), ...favorites].slice(0, count);
  const chosenNames = new Set(chosen.map(item => item.name));
  return [...chosen, ...pending.filter(item => !chosenNames.has(item.name))].slice(0,count);
}
