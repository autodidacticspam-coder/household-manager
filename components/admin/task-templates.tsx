'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loader2, Plus, MoreHorizontal, Pencil, Trash2, Zap, FileText, Repeat, Users } from 'lucide-react';
import { useTaskTemplates, useDeleteTaskTemplate } from '@/hooks/use-task-templates';
import type { TaskTemplate } from '@/types';
import { formatTime12h } from '@/lib/format-time';

const priorityColors: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

type TaskTemplatesProps = {
  onUseTemplate: (template: TaskTemplate) => void;
  onCreateTemplate: () => void;
  onEditTemplate: (template: TaskTemplate) => void;
};

export function TaskTemplates({ onUseTemplate, onCreateTemplate, onEditTemplate }: TaskTemplatesProps) {
  const t = useTranslations();
  const { data: templates, isLoading } = useTaskTemplates();
  const deleteTemplate = useDeleteTaskTemplate();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (deleteId) {
      await deleteTemplate.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('templates.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('templates.title')}
          </CardTitle>
          <Button size="sm" onClick={onCreateTemplate}>
            <Plus className="h-4 w-4 mr-1" />
            {t('common.new')}
          </Button>
        </CardHeader>
        <CardContent>
          {templates && templates.length > 0 ? (
            <div className="space-y-3">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">{template.name}</span>
                      {template.isRecurring && (
                        <Repeat className="h-3 w-3 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {template.category && (
                        <Badge variant="outline" className="text-xs">
                          {template.category.name}
                        </Badge>
                      )}
                      <Badge className={`text-xs ${priorityColors[template.priority]}`}>
                        {template.priority}
                      </Badge>
                      {template.defaultTime && (
                        <span>{formatTime12h(template.defaultTime)}</span>
                      )}
                      {template.defaultAssignments.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {template.defaultAssignments.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => onUseTemplate(template)}
                    >
                      <Zap className="h-4 w-4 mr-1" />
                      {t('templates.use')}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEditTemplate(template)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          {t('templates.edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-600"
                          onClick={() => setDeleteId(template.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t('templates.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">{t('templates.noTemplates')}</p>
              <p className="text-sm mt-1">{t('templates.createFirst')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('templates.delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('templates.confirmDelete')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteTemplate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                t('common.delete')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
