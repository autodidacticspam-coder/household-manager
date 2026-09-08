'use client';

import { useId, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { CheckCheck, Loader2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useRespondToFoodNote } from '@/hooks/use-food-note-responses';
import type { FoodNoteResponse as Response } from '@/lib/food-note-responses';
import { FOOD_NOTE_REPLY_MAX_LENGTH } from '@/lib/validators/food-note-response';

type Props = {
  source: 'request' | 'rating';
  id: string;
  noteRevision: string;
  responses: Response[];
  canRespond: boolean;
  userId?: string;
};

export function FoodNoteResponse(props: Props) {
  return <NoteResponse key={`${props.source}:${props.id}`} {...props} />;
}

function NoteResponse({ source, id, noteRevision, responses, canRespond, userId }: Props) {
  const t = useTranslations('foodNoteResponses');
  const format = useFormatter();
  const inputId = useId();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState('');
  const [replyRevision, setReplyRevision] = useState(noteRevision);
  const [error, setError] = useState<string | null>(null);
  const save = useRespondToFoodNote();
  const ownResponse = responses.find(response => response.respondedBy === userId);
  const noteChanged = replying && replyRevision !== noteRevision;
  const displayedError = noteChanged ? t('noteChanged') : error;

  async function submit(value: string | null) {
    if (save.isPending || (value !== null && (!value.trim() || noteChanged))) return;
    setError(null);
    try {
      const result = await save.mutateAsync({ source, id, noteRevision: value === null ? noteRevision : replyRevision, reply: value });
      if ('error' in result) setError(result.error);
      else { setReplying(false); setReply(''); }
    } catch {
      setError(t('saveResponseFailed'));
    }
  }

  return <div className="mt-3 min-w-0 space-y-2 whitespace-normal text-foreground">
    {responses.length === 0 && <p className="text-xs text-muted-foreground">{t('awaitingChef')}</p>}
    {responses.map(response => <div key={response.id} className="rounded-md border bg-background/80 p-2.5">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
        <CheckCheck className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" aria-hidden="true" />
        <span className="break-words">{t(response.reply ? 'repliedBy' : 'receivedBy', { name: response.chefName || t('chef') })}</span>
        <span>· {format.dateTime(new Date(response.repliedAt || response.receivedAt), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</span>
      </p>
      {response.reply && <p className="mt-1.5 whitespace-pre-wrap break-words text-sm">{response.reply}</p>}
    </div>)}
    {canRespond && !ownResponse?.reply && <>
      {!replying ? <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={save.isPending} onClick={() => { setError(null); setReplyRevision(noteRevision); setReplying(true); }}>
          <MessageSquare className="h-4 w-4" aria-hidden="true" />{t('reply')}
        </Button>
        {!ownResponse && <Button type="button" variant="outline" size="sm" disabled={save.isPending} onClick={() => void submit(null)}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCheck className="h-4 w-4" aria-hidden="true" />}{t('markReceived')}
        </Button>}
      </div> : <form className="space-y-2" onSubmit={event => { event.preventDefault(); void submit(reply); }}>
        <Label htmlFor={inputId}>{t('yourReply')}</Label>
        <Textarea id={inputId} value={reply} onChange={event => setReply(event.target.value)} rows={3}
          maxLength={FOOD_NOTE_REPLY_MAX_LENGTH} disabled={save.isPending} autoFocus
          placeholder={t('replyPlaceholder')} aria-invalid={!!displayedError} aria-describedby={displayedError ? `${inputId}-error` : undefined} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={save.isPending} onClick={() => { setReplying(false); setReply(''); setError(null); }}>{t('cancel')}</Button>
          <Button type="submit" size="sm" disabled={save.isPending || !reply.trim() || noteChanged}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}{t(save.isPending ? 'sending' : 'sendReply')}
          </Button>
        </div>
      </form>}
    </>}
    {displayedError && <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">{displayedError}</p>}
  </div>;
}
