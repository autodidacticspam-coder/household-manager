'use client';

import { use } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { TaskForm } from '@/components/admin/task-form';
import { useTask, useTaskBatchInfo } from '@/hooks/use-tasks';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

type EditTaskPageProps = {
  params: Promise<{ id: string }>;
};

export default function EditTaskPage({ params }: EditTaskPageProps) {
  const { id } = use(params);
  const t = useTranslations();
  const searchParams = useSearchParams();
  const isBatchMode = searchParams.get('batch') === 'true';
  const { data: task, isLoading } = useTask(id);
  const batchInfo = useTaskBatchInfo(isBatchMode ? id : null);

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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{t('tasks.editTask')}</h1>
          {isBatchMode && batchInfo.futureCount > 0 && (
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              {t('tasks.editAllFuture', { count: batchInfo.futureCount })}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground">
          {isBatchMode
            ? t('tasks.editRepeatingConfirmation', { count: batchInfo.futureCount })
            : t('descriptions.editTask')}
        </p>
      </div>

      <TaskForm task={task} batchMode={isBatchMode} />
    </div>
  );
}
