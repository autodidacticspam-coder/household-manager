'use client';

import { useMemo, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Copy, Lightbulb, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MenuTagFilter } from '@/components/food/menu-tag-filter';
import { useTaggableMenuItems } from '@/hooks/use-menu-tags';
import { useMealSuggestionHistory } from '@/hooks/use-meal-suggestions';
import { suggestMeals } from '@/lib/meal-suggestions';

export function MealSuggestions({ onRequestFood, onViewRequests }: {
  onRequestFood?: (name: string) => void;
  onViewRequests?: (name: string) => void;
}) {
  const t = useTranslations('mealSuggestions');
  const format = useFormatter();
  const history = useMealSuggestionHistory();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const catalog = useTaggableMenuItems();
  const suggestions = useMemo(() => {
    if (!history.data) return [];
    const allowedNames = selectedTags.length ? (catalog.data || [])
      .filter(item => selectedTags.every(id => item.tagIds.includes(id))).map(item => item.name) : undefined;
    return suggestMeals({ ...history.data, allowedNames });
  }, [history.data, selectedTags, catalog.data]);

  const copyDish = async (name: string) => {
    try { await navigator.clipboard.writeText(name); toast.success(t('copied')); }
    catch { setCopyFallback(name); }
  };
  const loading = history.isPending || (selectedTags.length > 0 && catalog.isPending);
  const failed = history.isError || (selectedTags.length > 0 && catalog.isError);

  return (
    <section aria-label={t('title')} className="rounded-xl border bg-amber-50/40 p-4 dark:bg-amber-950/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-semibold"><Lightbulb className="h-4 w-4" />{t('title')}</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <MenuTagFilter selectedTagIds={selectedTags} onChange={setSelectedTags} />
      </div>
      {loading ? <p role="status" className="mt-4 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{t('loading')}</p> : failed ? (
        <div role="alert" className="mt-4"><p>{t('error')}</p><Button variant="link" onClick={() => { void history.refetch(); void catalog.refetch(); }}>{t('retry')}</Button></div>
      ) : suggestions.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">{t(selectedTags.length ? 'noTagMatches' : 'empty')}</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {suggestions.map(suggestion => (
            <article key={suggestion.name} className="flex flex-col rounded-lg border bg-background p-3">
              <h4 className="break-words font-medium">{suggestion.name}</h4>
              {suggestion.pendingCount > 0 && <Badge variant="warning" className="mt-2 whitespace-normal">{t('pending', { count: suggestion.pendingCount })}</Badge>}
              <ul className="mt-2 flex-1 space-y-1 text-xs text-muted-foreground">
                <li>{suggestion.averageRating === null ? t('unrated') : t('rating', { score: format.number(suggestion.averageRating, { maximumFractionDigits: 1 }), count: suggestion.ratingCount, people: suggestion.raterCount })}</li>
                {suggestion.requestCount > 0 && <li>{t('requests', { count: suggestion.requestCount, people: suggestion.requesterCount })}</li>}
                <li>{suggestion.lastCompletedAt ? t('completed', { date: format.dateTime(new Date(suggestion.lastCompletedAt), { month: 'short', day: 'numeric', year: 'numeric' }) }) : t('completionUnknown')}</li>
                {suggestion.recentlyCompleted && <li>{t('recentRepeat')}</li>}
                {suggestion.ratingCount > 0 && suggestion.raterCount < 3 && <li>{t('smallSample')}</li>}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => copyDish(suggestion.name)} aria-label={t('copyNamed', { name: suggestion.name })}><Copy className="h-3 w-3" />{t('copy')}</Button>
                {suggestion.pendingCount > 0 ? onViewRequests && <Button size="sm" variant="outline" onClick={() => onViewRequests(suggestion.name)}>{t('viewRequests')}</Button> : onRequestFood && <Button size="sm" variant="outline" onClick={() => onRequestFood(suggestion.name)}>{t('request')}</Button>}
              </div>
            </article>
          ))}
        </div>
      )}
      <details className="mt-3 text-xs text-muted-foreground">
        <summary className="cursor-pointer">{t('how')}</summary>
        <p className="mt-2 max-w-3xl">{t('explanation')}</p>
      </details>
      <Dialog open={copyFallback !== null} onOpenChange={open => { if (!open) setCopyFallback(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('manualCopy')}</DialogTitle>
            <DialogDescription>{t('copyInstructions')}</DialogDescription>
          </DialogHeader>
          <Input value={copyFallback || ''} readOnly aria-label={t('copy')} onFocus={event => event.target.select()} />
        </DialogContent>
      </Dialog>
    </section>
  );
}
