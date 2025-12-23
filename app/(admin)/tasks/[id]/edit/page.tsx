'use client';

import { use } from 'react';
import { useTranslations } from 'next-intl';
import { TaskForm } from '@/components/admin/task-form';
import { useTask } from '@/hooks/use-tasks';
import { Skeleton } from '@/components/ui/skeleton';

type EditTaskPageProps = {
  params: Promise<{ id: string }>;
};

export default function EditTaskPage({ params }: EditTaskPageProps) {
  const { id } = use(params);
  const t = useTranslations();
  const { data: task, isLoading } = useTask(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96 mt-2" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('errors.notFound')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('tasks.editTask')}</h1>
        <p className="text-muted-foreground">
          {t('descriptions.editTask')}
        </p>
      </div>

      <TaskForm task={task} />
    </div>
  );
}
