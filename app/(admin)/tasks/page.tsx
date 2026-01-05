'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TaskCard } from '@/components/shared/task-card';
import { TaskTemplates } from '@/components/admin/task-templates';
import { TemplateFormDialog } from '@/components/admin/template-form-dialog';
import { useTasks, useTaskCategories, useDeleteTask, useCompleteTask } from '@/hooks/use-tasks';
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
import { Plus, Search, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import type { TaskTemplate, TaskWithRelations } from '@/types';
import { TaskDetailDialog } from '@/components/shared/task-detail-dialog';

export default function TasksPage() {
  const t = useTranslations();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<TaskTemplate | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);

  const { data: categories } = useTaskCategories();
  const { data: tasks, isLoading } = useTasks({
    status: statusFilter !== 'all' ? statusFilter as 'pending' | 'in_progress' | 'completed' : undefined,
    priority: priorityFilter !== 'all' ? priorityFilter as 'low' | 'medium' | 'high' | 'urgent' : undefined,
    categoryId: categoryFilter !== 'all' ? categoryFilter : undefined,
    search: search || undefined,
  });

  const deleteTask = useDeleteTask();
  const completeTask = useCompleteTask();

  const handleComplete = async (id: string) => {
    await completeTask.mutateAsync(id);
  };

  const handleEdit = (id: string) => {
    router.push(`/tasks/${id}/edit`);
  };

  const handleDelete = async () => {
    if (deleteTaskId) {
      await deleteTask.mutateAsync(deleteTaskId);
      setDeleteTaskId(null);
    }
  };

  const handleUseTemplate = (template: TaskTemplate) => {
    router.push(`/tasks/new?template=${template.id}`);
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateDialogOpen(true);
  };

  const handleEditTemplate = (template: TaskTemplate) => {
    setEditingTemplate(template);
    setTemplateDialogOpen(true);
  };

  const handleCloseTemplateDialog = () => {
    setTemplateDialogOpen(false);
    setEditingTemplate(null);
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
        <TaskTemplates
          onUseTemplate={handleUseTemplate}
          onCreateTemplate={handleCreateTemplate}
          onEditTemplate={handleEditTemplate}
        />
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder={t('common.status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            <SelectItem value="pending">{t('tasks.pending')}</SelectItem>
            <SelectItem value="in_progress">{t('tasks.inProgress')}</SelectItem>
            <SelectItem value="completed">{t('tasks.completed')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder={t('tasks.priority')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            <SelectItem value="low">{t('tasks.priorities.low')}</SelectItem>
            <SelectItem value="medium">{t('tasks.priorities.medium')}</SelectItem>
            <SelectItem value="high">{t('tasks.priorities.high')}</SelectItem>
            <SelectItem value="urgent">{t('tasks.priorities.urgent')}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder={t('tasks.category')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            {categories?.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: category.color }} />
                  {category.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            <AlertDialogDescription>{t('tasks.deleteConfirmation')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TemplateFormDialog
        open={templateDialogOpen}
        onClose={handleCloseTemplateDialog}
        template={editingTemplate}
      />

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
