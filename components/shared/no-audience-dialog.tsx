'use client';

import { useTranslations } from 'next-intl';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type NoAudienceDialogProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Confirms saving a task or activity that only admins will be able to see. */
export function NoAudienceDialog({ open, onCancel, onConfirm }: NoAudienceDialogProps) {
  const t = useTranslations('tasks.noAudience');

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('title')}</AlertDialogTitle>
          <AlertDialogDescription>{t('description')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('goBack')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{t('saveAnyway')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
