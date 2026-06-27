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

const GENERIC_SINGLE_TOKEN_CORES = new Set([
  'bean',
  'beef',
  'bowl',
  'bread',
  'burger',
  'chicken',
  'curry',
  'duck',
  'dumpling',
  'egg',
  'fish',
  'fry',
  'lamb',
  'meat',
  'noodle',
  'pasta',
  'pork',
  'potato',
  'rice',
  'salad',
  'sandwich',
  'seafood',
  'shrimp',
  'side',
  'soup',
  'steak',
  'taco',
  'tofu',
  'vegetable',
  'veggie',
  'wrap',
]);

const OUTER_MODIFIERS = new Set([
  'asian',
  'baked',
  'bbq',
  'blackened',
  'braised',
  'broiled',
  'caramelized',
  'charred',
  'chinese',
  'classic',
  'crispy',
  'fresh',
  'french',
  'garlic',
  'glazed',
  'grilled',
  'herb',
  'honey',
  'house',
  'italian',
  'japanese',
  'korean',
  'lemon',
  'lime',
  'mexican',
  'roasted',
  'sauteed',
  'seared',
  'slow',
  'smoked',
  'spicy',
  'sweet',
  'thai',
  'toasted',
  'warm',
]);

const CORE_CONNECTOR_PATTERNS = [
  /\bserved\s+(?:with|over|on|in)\b/,
  /\btopped\s+with\b/,
  /\bfinished\s+with\b/,
  /\bdrizzled\s+with\b/,
  /\bglazed\s+with\b/,
  /\bgarnished\s+with\b/,
  /\bpaired\s+with\b/,
  /\baccompanied\s+by\b/,
  /\balongside\b/,
  /\bwith\b/,
  /\bover\b/,
  /\bon\b/,
  /\bin\b/,
  /\bplus\b/,
];

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
  const tokens = orderedFoodNameTokens(name)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));

  return Array.from(new Set(tokens)).sort();
}

function orderedFoodNameTokens(name: string): string[] {
  const seen = new Set<string>();

  return normalizeFoodName(name)
    .split(' ')
    .map(singularizeToken)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
    .filter((token) => {
      if (seen.has(token)) return false;
      seen.add(token);
      return true;
    });
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

function isSpecificCoreTokens(tokens: string[]): boolean {
  if (tokens.length >= 2) return true;

  return tokens.length === 1 && !GENERIC_SINGLE_TOKEN_CORES.has(tokens[0]);
}

function isSpecificCorePhrase(name: string): boolean {
  return isSpecificCoreTokens(orderedFoodNameTokens(name));
}

function tokensToName(tokens: string[]): string {
  return tokens.join(' ');
}

function stripOuterModifiers(tokens: string[]): string[] {
  let start = 0;
  let end = tokens.length;

  while (end - start > 1 && OUTER_MODIFIERS.has(tokens[start])) {
    const nextTokens = tokens.slice(start + 1, end);
    if (!isSpecificCoreTokens(nextTokens)) break;
    start++;
  }

  while (end - start > 1 && OUTER_MODIFIERS.has(tokens[end - 1])) {
    const nextTokens = tokens.slice(start, end - 1);
    if (!isSpecificCoreTokens(nextTokens)) break;
    end--;
  }

  return tokens.slice(start, end);
}

function addCoreCandidate(candidates: Set<string>, name: string) {
  const tokens = orderedFoodNameTokens(name);
  if (!isSpecificCoreTokens(tokens)) return;

  candidates.add(tokensToName(tokens));

  const strippedTokens = stripOuterModifiers(tokens);
  if (isSpecificCoreTokens(strippedTokens)) {
    candidates.add(tokensToName(strippedTokens));
  }
}

function getCoreCandidates(name: string): string[] {
  const normalized = normalizeFoodName(name);
  const candidates = new Set<string>();

  addCoreCandidate(candidates, normalized);

  for (const pattern of CORE_CONNECTOR_PATTERNS) {
    const match = normalized.match(pattern);
    if (match?.index === undefined || match.index <= 0) continue;

    addCoreCandidate(candidates, normalized.slice(0, match.index));
  }

  return Array.from(candidates).sort((a, b) => a.length - b.length);
}

function getPrimaryCore(name: string): { name: string; tokens: string[] } {
  const candidates = getCoreCandidates(name);
  const coreName = candidates[0] || normalizeFoodName(name);

  return {
    name: coreName,
    tokens: orderedFoodNameTokens(coreName),
  };
}

function hasSharedSpecificPrefix(a: string[], b: string[]): boolean {
  const shared: string[] = [];
  const limit = Math.min(a.length, b.length);

  for (let index = 0; index < limit; index++) {
    if (a[index] !== b[index]) break;
    shared.push(a[index]);
  }

  return shared.length >= 2 && isSpecificCoreTokens(shared);
}

function hasSpecificContainment(shorterName: string, longerName: string): boolean {
  if (!shorterName || shorterName === longerName) return false;
  if (!isSpecificCorePhrase(shorterName)) return false;

  return longerName.startsWith(`${shorterName} `) ||
    longerName.includes(` ${shorterName} `) ||
    longerName.endsWith(` ${shorterName}`);
}

function similarityScore(a: string, b: string): { score: number; reason: string } {
  const normalizedA = normalizeFoodName(a);
  const normalizedB = normalizeFoodName(b);

  if (normalizedA === normalizedB) {
    return { score: 1, reason: 'Same normalized name' };
  }

  const coreA = getPrimaryCore(a);
  const coreB = getPrimaryCore(b);
  const coreCandidatesA = new Set(getCoreCandidates(a));
  const sharedCore = getCoreCandidates(b).find((candidate) => coreCandidatesA.has(candidate));

  if (sharedCore && isSpecificCorePhrase(sharedCore)) {
    return { score: 0.97, reason: `Same core dish: ${sharedCore}` };
  }

  const shorterCore = coreA.name.length <= coreB.name.length ? coreA.name : coreB.name;
  const longerCore = coreA.name.length <= coreB.name.length ? coreB.name : coreA.name;

  if (hasSpecificContainment(shorterCore, longerCore)) {
    return { score: 0.94, reason: `One name expands on ${shorterCore}` };
  }

  const shorterNormalized = normalizedA.length <= normalizedB.length ? normalizedA : normalizedB;
  const longerNormalized = normalizedA.length <= normalizedB.length ? normalizedB : normalizedA;

  if (hasSpecificContainment(shorterNormalized, longerNormalized)) {
    return { score: 0.93, reason: `One name adds details to ${shorterNormalized}` };
  }

  if (hasSharedSpecificPrefix(coreA.tokens, coreB.tokens)) {
    const sharedTokens: string[] = [];
    const limit = Math.min(coreA.tokens.length, coreB.tokens.length);

    for (let index = 0; index < limit; index++) {
      if (coreA.tokens[index] !== coreB.tokens[index]) break;
      sharedTokens.push(coreA.tokens[index]);
    }

    return { score: 0.9, reason: `Same leading dish name: ${tokensToName(sharedTokens)}` };
  }

  const editDistance = levenshteinDistance(normalizedA, normalizedB);
  const editSimilarity = 1 - editDistance / Math.max(normalizedA.length, normalizedB.length);

  const tokensA = foodNameTokens(a);
  const tokensB = foodNameTokens(b);
  const overlap = tokenSimilarity(tokensA, tokensB);
  const containment = hasSpecificContainment(shorterNormalized, longerNormalized);

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
    shouldSuggest: similarity.score >= 0.84,
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
