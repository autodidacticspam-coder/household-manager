export type FoodNameMergeLike = {
  sourceName: string;
  canonicalName: string;
};

export type FoodNameStats = {
  name: string;
  totalRatings: number;
  averageRating?: number;
  lastRatedAt?: string;
};

export type PotentialFoodMergeGroup = {
  id: string;
  recommendedName: string;
  items: FoodNameStats[];
  score: number;
  reason: string;
};

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'with',
  'w',
  'side',
  'sides',
  'served',
  'fresh',
  'homemade',
  'house',
  'style',
]);

export function normalizeFoodName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\bw\//g, ' with ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalizeFoodName(
  name: string,
  merges: FoodNameMergeLike[] | undefined
): string {
  if (!merges?.length) return name;

  const mergeMap = new Map(
    merges.map((merge) => [normalizeFoodName(merge.sourceName), merge.canonicalName])
  );

  let currentName = name;
  const visited = new Set<string>();

  for (let i = 0; i < 8; i++) {
    const normalized = normalizeFoodName(currentName);
    if (visited.has(normalized)) break;
    visited.add(normalized);

    const nextName = mergeMap.get(normalized);
    if (!nextName) break;
    currentName = nextName;
  }

  return currentName;
}

export function areSameCanonicalFoodName(
  a: string,
  b: string,
  merges: FoodNameMergeLike[] | undefined
): boolean {
  return normalizeFoodName(canonicalizeFoodName(a, merges)) === normalizeFoodName(canonicalizeFoodName(b, merges));
}

function singularizeToken(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.endsWith('es')) return token.slice(0, -2);
  if (token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function foodNameTokens(name: string): string[] {
  const tokens = normalizeFoodName(name)
    .split(' ')
    .map(singularizeToken)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

  return Array.from(new Set(tokens)).sort();
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost
      );
    }

    for (let j = 0; j <= b.length; j++) {
      previous[j] = current[j];
    }
  }

  return previous[b.length];
}

function tokenSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;

  const bSet = new Set(b);
  const intersection = a.filter((token) => bSet.has(token)).length;
  const union = new Set([...a, ...b]).size;

  return intersection / union;
}

function similarityScore(a: string, b: string): { score: number; reason: string } {
  const normalizedA = normalizeFoodName(a);
  const normalizedB = normalizeFoodName(b);

  if (normalizedA === normalizedB) {
    return { score: 1, reason: 'Same normalized name' };
  }

  const editDistance = levenshteinDistance(normalizedA, normalizedB);
  const editSimilarity = 1 - editDistance / Math.max(normalizedA.length, normalizedB.length);

  const tokensA = foodNameTokens(a);
  const tokensB = foodNameTokens(b);
  const overlap = tokenSimilarity(tokensA, tokensB);
  const shorter = normalizedA.length < normalizedB.length ? normalizedA : normalizedB;
  const longer = normalizedA.length < normalizedB.length ? normalizedB : normalizedA;
  const containment = shorter.length >= 8 && longer.includes(shorter);

  const score = Math.max(editSimilarity, overlap, containment ? 0.86 : 0);

  if (editSimilarity >= 0.86) {
    return { score, reason: 'Very similar spelling' };
  }

  if (overlap >= 0.78 && Math.min(tokensA.length, tokensB.length) >= 2) {
    return { score, reason: 'Same key words' };
  }

  if (containment && overlap >= 0.5) {
    return { score, reason: 'One name contains the other' };
  }

  return { score, reason: 'Possible duplicate' };
}

function shouldSuggestMerge(a: string, b: string): { shouldSuggest: boolean; score: number; reason: string } {
  const similarity = similarityScore(a, b);

  return {
    shouldSuggest: similarity.score >= 0.86,
    score: similarity.score,
    reason: similarity.reason,
  };
}

function getRecommendedCanonicalName(items: FoodNameStats[]): string {
  return [...items].sort((a, b) => {
    if (b.totalRatings !== a.totalRatings) return b.totalRatings - a.totalRatings;
    return a.name.length - b.name.length;
  })[0].name;
}

export function findPotentialFoodMergeGroups(
  items: FoodNameStats[],
  activeMerges: FoodNameMergeLike[] | undefined
): PotentialFoodMergeGroup[] {
  const activeSourceNames = new Set(
    (activeMerges || []).map((merge) => normalizeFoodName(merge.sourceName))
  );
  const uniqueItems = items
    .filter((item) => item.name.trim() && !activeSourceNames.has(normalizeFoodName(item.name)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const parent = new Map<string, string>();
  const scores = new Map<string, { score: number; reason: string }>();

  const find = (name: string): string => {
    const current = parent.get(name) || name;
    if (current === name) return current;
    const root = find(current);
    parent.set(name, root);
    return root;
  };

  const union = (a: string, b: string, score: number, reason: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;

    parent.set(rootB, rootA);
    scores.set(rootA, { score: Math.max(scores.get(rootA)?.score || 0, score), reason });
  };

  for (const item of uniqueItems) {
    parent.set(item.name, item.name);
  }

  for (let i = 0; i < uniqueItems.length; i++) {
    for (let j = i + 1; j < uniqueItems.length; j++) {
      const candidate = shouldSuggestMerge(uniqueItems[i].name, uniqueItems[j].name);
      if (candidate.shouldSuggest) {
        union(uniqueItems[i].name, uniqueItems[j].name, candidate.score, candidate.reason);
      }
    }
  }

  const groups = new Map<string, FoodNameStats[]>();
  for (const item of uniqueItems) {
    const root = find(item.name);
    groups.set(root, [...(groups.get(root) || []), item]);
  }

  return Array.from(groups.entries())
    .filter(([, groupItems]) => groupItems.length > 1)
    .map(([root, groupItems]) => {
      const sortedItems = [...groupItems].sort((a, b) => b.totalRatings - a.totalRatings);
      const score = scores.get(root)?.score || 0.86;

      return {
        id: sortedItems.map((item) => normalizeFoodName(item.name)).join('|'),
        recommendedName: getRecommendedCanonicalName(sortedItems),
        items: sortedItems,
        score,
        reason: scores.get(root)?.reason || 'Possible duplicate',
      };
    })
    .sort((a, b) => b.score - a.score || b.items.length - a.items.length);
}
