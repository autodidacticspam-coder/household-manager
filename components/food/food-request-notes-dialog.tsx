'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateFoodRequestNotes, type FoodRequest } from '@/hooks/use-food-requests';
import { FOOD_REQUEST_NOTES_MAX_LENGTH } from '@/lib/validators/food-request-notes';

export function FoodRequestNotesDialog({ request, onClose }: { request: FoodRequest; onClose: () => void }) {
  const t = useTranslations('foodRequests');
  const inputId = useId();
  const [notes, setNotes] = useState(request.notes || '');
  const [error, setError] = useState<string | null>(null);
  const updateNotes = useUpdateFoodRequestNotes();
  const unchanged = notes.trim() === (request.notes || '').trim();

  return (
    <Dialog open onOpenChange={open => { if (!open && !updateNotes.isPending) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto" showCloseButton={!updateNotes.isPending}>
        <form className="space-y-4" onSubmit={async event => {
          event.preventDefault();
          if (updateNotes.isPending || unchanged) return;
          setError(null);
          try {
            const result = await updateNotes.mutateAsync({ id: request.id, notes, updatedAt: request.updatedAt });
            if ('error' in result) setError(result.error);
            else onClose();
          } catch {
            setError(t('saveNotesFailed'));
          }
        }}>
          <DialogHeader>
            <DialogTitle>{request.notes ? t('editNotes') : t('addNotes')}</DialogTitle>
            <DialogDescription className="break-words">{t('notesFor', { dish: request.foodName })}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={inputId}>{t('notes')}</Label>
            <Textarea id={inputId} value={notes} onChange={event => setNotes(event.target.value)} rows={5}
              maxLength={FOOD_REQUEST_NOTES_MAX_LENGTH} disabled={updateNotes.isPending}
              aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ''}`} aria-invalid={!!error}
              placeholder={t('notesPlaceholder')} className="max-h-[45dvh] resize-y" />
            <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">{t('clearNotesHint')}</p>
            {error && <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={updateNotes.isPending}>{t('cancel')}</Button>
            <Button type="submit" disabled={updateNotes.isPending || unchanged}>
              {updateNotes.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t(updateNotes.isPending ? 'savingNotes' : 'saveNotes')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
