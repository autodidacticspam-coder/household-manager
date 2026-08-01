// Shared helpers for menu/food tags.

export type MenuTagColor =
  | 'red' | 'orange' | 'amber' | 'yellow' | 'lime' | 'green' | 'emerald'
  | 'teal' | 'cyan' | 'sky' | 'blue' | 'indigo' | 'violet' | 'purple'
  | 'fuchsia' | 'pink' | 'rose' | 'slate' | 'stone';

export const MENU_TAG_COLOR_OPTIONS: MenuTagColor[] = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald',
  'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple',
  'fuchsia', 'pink', 'rose', 'slate', 'stone',
];

// Tailwind cannot build dynamic class names, so every color variant is spelled out.
const TAG_BADGE_CLASSES: Record<MenuTagColor, string> = {
  red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
  orange: 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300',
  amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  yellow: 'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-300',
  lime: 'border-lime-200 bg-lime-50 text-lime-700 dark:border-lime-800 dark:bg-lime-950/40 dark:text-lime-300',
  green: 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  teal: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300',
  cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300',
  sky: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
  blue: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300',
  violet: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300',
  purple: 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300',
  fuchsia: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-800 dark:bg-fuchsia-950/40 dark:text-fuchsia-300',
  pink: 'border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-800 dark:bg-pink-950/40 dark:text-pink-300',
  rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
  slate: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300',
  stone: 'border-stone-200 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-900/60 dark:text-stone-300',
};

const TAG_DOT_CLASSES: Record<MenuTagColor, string> = {
  red: 'bg-red-500', orange: 'bg-orange-500', amber: 'bg-amber-500', yellow: 'bg-yellow-500',
  lime: 'bg-lime-500', green: 'bg-green-500', emerald: 'bg-emerald-500', teal: 'bg-teal-500',
  cyan: 'bg-cyan-500', sky: 'bg-sky-500', blue: 'bg-blue-500', indigo: 'bg-indigo-500',
  violet: 'bg-violet-500', purple: 'bg-purple-500', fuchsia: 'bg-fuchsia-500', pink: 'bg-pink-500',
  rose: 'bg-rose-500', slate: 'bg-slate-500', stone: 'bg-stone-500',
};

const FALLBACK_COLOR: MenuTagColor = 'slate';

function asMenuTagColor(color?: string | null): MenuTagColor {
  if (color && color in TAG_BADGE_CLASSES) return color as MenuTagColor;
  return FALLBACK_COLOR;
}

export function getTagBadgeClasses(color?: string | null): string {
  return TAG_BADGE_CLASSES[asMenuTagColor(color)];
}

export function getTagDotClasses(color?: string | null): string {
  return TAG_DOT_CLASSES[asMenuTagColor(color)];
}

// Short code shown on compact badges: "GF" for Gluten Free, falls back to the name.
export function getTagDisplayLabel(tag: { name: string; label?: string | null }): string {
  const label = tag.label?.trim();
  return label || tag.name;
}

// Mirrors the SQL normalize_menu_item_name() function so dish names typed in the
// weekly menu can be matched against catalog records client-side.
export function normalizeMenuItemName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function slugifyTagName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug) return slug;
  // Non-latin names (e.g. Chinese) can slugify to nothing; keep slugs unique anyway.
  return `tag-${Math.random().toString(36).slice(2, 10)}`;
}
