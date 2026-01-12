'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TaskCard } from '@/components/shared/task-card';
import { TaskTemplates } from '@/components/admin/task-templates';
import { useTasks, useTaskCategories, useDeleteTask, useDeleteFutureTasks, useTaskBatchInfo, useCompleteTask } from '@/hooks/use-tasks';
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
import { Plus, Search, FileText, ChevronDown, ChevronUp, X } from 'lucide-react';
import type { TaskTemplate, TaskWithRelations } from '@/types';
import { TaskDetailDialog } from '@/components/shared/task-detail-dialog';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'admin-task-filters';

type StatusFilter = 'pending' | 'in_progress' | 'completed';
type PriorityFilter = 'low' | 'medium' | 'high' | 'urgent';

interface SavedFilters {
  status: StatusFilter[];
  priority: PriorityFilter[];
  categories: string[];
}

function loadSavedFilters(): SavedFilters {
  if (typeof window === 'undefined') {
    return { status: ['pending'], priority: [], categories: [] };
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {
    // Ignore parse errors
  }
  return { status: ['pending'], priority: [], categories: [] };
}

function saveFilters(filters: SavedFilters) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Ignore storage errors
  }
}

export default function TasksPage() {
  const t = useTranslations();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [statusFilters, setStatusFilters] = useState<StatusFilter[]>(['pending']);
  const [priorityFilters, setPriorityFilters] = useState<PriorityFilter[]>([]);
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [filtersLoaded, setFiltersLoaded] = useState(false);

  // Load filters from localStorage on mount
  useEffect(() => {
    const saved = loadSavedFilters();
    setStatusFilters(saved.status);
    setPriorityFilters(saved.priority);
    setCategoryFilters(saved.categories);
    setFiltersLoaded(true);
  }, []);

  // Save filters to localStorage when they change
  useEffect(() => {
    if (filtersLoaded) {
      saveFilters({
        status: statusFilters,
        priority: priorityFilters,
        categories: categoryFilters,
      });
    }
  }, [statusFilters, priorityFilters, categoryFilters, filtersLoaded]);

  const toggleStatus = (status: StatusFilter) => {
    setStatusFilters(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const togglePriority = (priority: PriorityFilter) => {
    setPriorityFilters(prev =>
      prev.includes(priority)
        ? prev.filter(p => p !== priority)
        : [...prev, priority]
    );
  };

  const toggleCategory = (categoryId: string) => {
    setCategoryFilters(prev =>
      prev.includes(categoryId)
        ? prev.filter(c => c !== categoryId)
        : [...prev, categoryId]
    );
  };

  const clearAllFilters = () => {
    setStatusFilters([]);
    setPriorityFilters([]);
    setCategoryFilters([]);
  };

  const hasActiveFilters = statusFilters.length > 0 || priorityFilters.length > 0 || categoryFilters.length > 0;

  const { data: categories } = useTaskCategories();
  const { data: tasks, isLoading } = useTasks({
    status: statusFilters.length > 0 ? statusFilters : undefined,
    priority: priorityFilters.length > 0 ? priorityFilters : undefined,
    categoryId: categoryFilters.length > 0 ? categoryFilters : undefined,
    search: search || undefined,
  });

  const deleteTask = useDeleteTask();
  const deleteFutureTasks = useDeleteFutureTasks();
  const completeTask = useCompleteTask();

  // Get batch info for the task being deleted (queries database directly)
  const batchInfo = useTaskBatchInfo(deleteTaskId);

  const handleComplete = async (id: string) => {
    await completeTask.mutateAsync(id);
  };

  const handleEdit = (id: string) => {
    router.push(`/tasks/${id}/edit`);
  };

  const handleDeleteSingle = async () => {
    if (deleteTaskId) {
      await deleteTask.mutateAsync(deleteTaskId);
      setDeleteTaskId(null);
    }
  };

  const handleDeleteFuture = async () => {
    if (deleteTaskId) {
      await deleteFutureTasks.mutateAsync(deleteTaskId);
      setDeleteTaskId(null);
    }
  };

  const handleUseTemplate = (template: TaskTemplate) => {
    router.push(`/tasks/new?template=${template.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('tasks.title')}</h1>
          <p className="text-muted-foreground">{t('descriptions.tasks')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowTemplates(!showTemplates)}>
            <FileText className="h-4 w-4 mr-2" />
            {t('templates.title')}
            {showTemplates ? <ChevronUp className="h-4 w-4 ml-2" /> : <ChevronDown className="h-4 w-4 ml-2" />}
          </Button>
          <Button onClick={() => router.push('/tasks/new')}>
            <Plus className="h-4 w-4 mr-2" />
            {t('tasks.createTask')}
          </Button>
        </div>
      </div>

      {showTemplates && (
        <TaskTemplates onUseTemplate={handleUseTemplate} />
      )}

      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 max-w-md"
          />
        </div>

        <div className="space-y-3">
          {/* Status filters */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground min-w-16">{t('common.status')}:</span>
            <button
              onClick={() => toggleStatus('pending')}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                statusFilters.includes('pending')
                  ? 'bg-yellow-100 text-yellow-800 ring-2 ring-yellow-400'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {t('tasks.pending')}
            </button>
            <button
              onClick={() => toggleStatus('in_progress')}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                statusFilters.includes('in_progress')
                  ? 'bg-blue-100 text-blue-800 ring-2 ring-blue-400'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {t('tasks.inProgress')}
            </button>
            <button
              onClick={() => toggleStatus('completed')}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                statusFilters.includes('completed')
                  ? 'bg-green-100 text-green-800 ring-2 ring-green-400'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {t('tasks.completed')}
            </button>
          </div>

          {/* Priority filters */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground min-w-16">{t('tasks.priority')}:</span>
            <button
              onClick={() => togglePriority('low')}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                priorityFilters.includes('low')
                  ? 'bg-gray-200 text-gray-800 ring-2 ring-gray-400'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {t('tasks.priorities.low')}
            </button>
            <button
              onClick={() => togglePriority('medium')}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                priorityFilters.includes('medium')
                  ? 'bg-blue-100 text-blue-800 ring-2 ring-blue-400'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {t('tasks.priorities.medium')}
            </button>
            <button
              onClick={() => togglePriority('high')}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                priorityFilters.includes('high')
                  ? 'bg-orange-100 text-orange-800 ring-2 ring-orange-400'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {t('tasks.priorities.high')}
            </button>
            <button
              onClick={() => togglePriority('urgent')}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                priorityFilters.includes('urgent')
                  ? 'bg-red-100 text-red-800 ring-2 ring-red-400'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {t('tasks.priorities.urgent')}
            </button>
          </div>

          {/* Category filters */}
          {categories && categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground min-w-16">{t('tasks.category')}:</span>
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => toggleCategory(category.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5',
                    categoryFilters.includes(category.id)
                      ? 'ring-2'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                  style={categoryFilters.includes(category.id) ? {
                    backgroundColor: `${category.color}20`,
                    color: category.color,
                    ['--tw-ring-color' as string]: category.color,
                  } : undefined}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  {category.name}
                </button>
              ))}
            </div>
          )}

          {/* Clear all filters button */}
          {hasActiveFilters && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4 mr-1" />
                {t('common.clearFilters')}
              </Button>
              <span className="text-sm text-muted-foreground">
                {tasks?.length ?? 0} {t('tasks.tasksFound')}
              </span>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : tasks && tasks.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onClick={(t) => setSelectedTask(t)}
              onComplete={handleComplete}
              onEdit={handleEdit}
              onDelete={(id) => setDeleteTaskId(id)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('tasks.noTasks')}</p>
          <Button variant="link" onClick={() => router.push('/tasks/new')} className="mt-2">
            {t('tasks.createTask')}
          </Button>
        </div>
      )}

      <AlertDialog open={!!deleteTaskId} onOpenChange={() => setDeleteTaskId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {batchInfo.isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {t('common.loading')}
                </span>
              ) : batchInfo.isRepeating ? (
                t('tasks.deleteRepeatingConfirmation', { count: batchInfo.futureCount })
              ) : (
                t('tasks.deleteConfirmation')
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={batchInfo.isRepeating ? 'flex-col sm:flex-row gap-2' : ''}>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            {batchInfo.isLoading ? null : batchInfo.isRepeating ? (
              <>
                <AlertDialogAction
                  onClick={handleDeleteSingle}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {t('tasks.deleteThisOnly')}
                </AlertDialogAction>
                <AlertDialogAction
                  onClick={handleDeleteFuture}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {t('tasks.deleteAllFuture', { count: batchInfo.futureCount })}
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction onClick={handleDeleteSingle}>{t('common.delete')}</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TaskDetailDialog
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        onComplete={(id) => {
          handleComplete(id);
          setSelectedTask(null);
        }}
        onEdit={(id) => {
          handleEdit(id);
          setSelectedTask(null);
        }}
      />
    </div>
  );
}
