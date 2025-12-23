'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { TaskCard } from '@/components/shared/task-card';
import { useMyTasks, useCompleteTask, useUpdateTaskStatus } from '@/hooks/use-tasks';
import { CheckSquare, Clock, Loader2 } from 'lucide-react';

export default function MyTasksPage() {
  const t = useTranslations();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('pending');

  const { data: tasks, isLoading } = useMyTasks(user?.id);
  const completeTask = useCompleteTask();
  const updateTaskStatus = useUpdateTaskStatus();

  const pendingTasks = tasks?.filter((task) => task.status === 'pending') || [];
  const inProgressTasks = tasks?.filter((task) => task.status === 'in_progress') || [];
  const completedTasks = tasks?.filter((task) => task.status === 'completed') || [];

  const handleComplete = async (id: string) => {
    await completeTask.mutateAsync(id);
  };

  const handleUndo = async (id: string) => {
    await updateTaskStatus.mutateAsync({ id, status: 'pending' });
  };

  const handleStartTask = async (id: string) => {
    await updateTaskStatus.mutateAsync({ id, status: 'in_progress' });
  };

  const getTasksByTab = () => {
    switch (activeTab) {
      case 'pending':
        return pendingTasks;
      case 'in_progress':
        return inProgressTasks;
      case 'completed':
        return completedTasks;
      default:
        return [];
    }
  };

  const currentTasks = getTasksByTab();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('tasks.myTasks')}</h1>
        <p className="text-muted-foreground">
          {t('descriptions.myTasks')}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card
          className={`cursor-pointer transition-shadow hover:shadow-md ${activeTab === 'pending' ? 'ring-2 ring-yellow-500' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('tasks.pending')}
            </CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <Skeleton className="h-8 w-8" /> : pendingTasks.length}
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-shadow hover:shadow-md ${activeTab === 'in_progress' ? 'ring-2 ring-blue-500' : ''}`}
          onClick={() => setActiveTab('in_progress')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('tasks.inProgress')}
            </CardTitle>
            <Loader2 className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <Skeleton className="h-8 w-8" /> : inProgressTasks.length}
            </div>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-shadow hover:shadow-md ${activeTab === 'completed' ? 'ring-2 ring-green-500' : ''}`}
          onClick={() => setActiveTab('completed')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('tasks.completed')}
            </CardTitle>
            <CheckSquare className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <Skeleton className="h-8 w-8" /> : completedTasks.length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending">
            {t('tasks.pending')} ({pendingTasks.length})
          </TabsTrigger>
          <TabsTrigger value="in_progress">
            {t('tasks.inProgress')} ({inProgressTasks.length})
          </TabsTrigger>
          <TabsTrigger value="completed">
            {t('tasks.completed')} ({completedTasks.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48" />
              ))}
            </div>
          ) : currentTasks.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {currentTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onComplete={handleComplete}
                  onUndo={handleUndo}
                  isEmployee
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground">
                  {activeTab === 'pending'
                    ? t('tasks.noPendingTasks')
                    : t('tasks.noTasks')}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
