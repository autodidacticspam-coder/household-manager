'use client';

import { Suspense } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { TaskForm } from '@/components/admin/task-form';
import { useTaskTemplate } from '@/hooks/use-task-templates';
import { Loader2 } from 'lucide-react';

function NewTaskContent() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const templateId = searchParams.get('template');

  const { data: template, isLoading: templateLoading } = useTaskTemplate(templateId || '');

  if (templateId && templateLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('tasks.createTask')}</h1>
        <p className="text-muted-foreground">
          {template ? t('templates.usingTemplate', { name: template.name }) : t('descriptions.createTask')}
        </p>
      </div>

      <TaskForm template={template} />
    </div>
  );
}

export default function NewTaskPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <NewTaskContent />
    </Suspense>
  );
}
