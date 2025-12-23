'use client';

import { useTranslations } from 'next-intl';
import { TaskForm } from '@/components/admin/task-form';

export default function NewTaskPage() {
  const t = useTranslations();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('tasks.createTask')}</h1>
        <p className="text-muted-foreground">
          {t('descriptions.createTask')}
        </p>
      </div>

      <TaskForm />
    </div>
  );
}
