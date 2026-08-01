'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MenuTagBadge } from '@/components/food/menu-tag-badge';
import { useGroupedMenuTags, useLocalizedTagGroupName } from '@/components/food/grouped-tag-list';
import {
  useCreateMenuTag,
  useDeleteMenuTag,
  useMenuTagGroups,
  useMenuTags,
  useMenuTagUsage,
  useUpdateMenuTag,
  type MenuTag,
} from '@/hooks/use-menu-tags';
import { MENU_TAG_COLOR_OPTIONS, getTagDotClasses } from '@/lib/menu-tags';
import { cn } from '@/lib/utils';

type TagFormValues = {
  name: string;
  label: string;
  color: string;
  groupId: string;
};

// Admin dialog to create, edit, and delete the food tags used across the app.
export function ManageMenuTagsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('foodTags');
  const tCommon = useTranslations('common');
  const { data: tags = [], isLoading: tagsLoading } = useMenuTags({ enabled: open });
  const { data: groups = [] } = useMenuTagGroups();
  const { data: usage = {} } = useMenuTagUsage({ enabled: open });
  const createTag = useCreateMenuTag();
  const updateTag = useUpdateMenuTag();
  const deleteTag = useDeleteMenuTag();

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [tagPendingDelete, setTagPendingDelete] = useState<MenuTag | null>(null);
  const sections = useGroupedMenuTags(tags);
  const localizeGroupName = useLocalizedTagGroupName();

  const defaultGroupId =
    groups.find((group) => group.slug === 'custom')?.id || groups[0]?.id || '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5" />
            {t('manageTags')}
          </DialogTitle>
          <DialogDescription>{t('manageTagsDescription')}</DialogDescription>
        </DialogHeader>

        {showAddForm ? (
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="mb-3 text-sm font-medium">{t('addTag')}</p>
            <TagForm
              groups={groups}
              localizeGroupName={localizeGroupName}
              initial={{ name: '', label: '', color: 'emerald', groupId: defaultGroupId }}
              isSaving={createTag.isPending}
              submitLabel={t('addTag')}
              onCancel={() => setShowAddForm(false)}
              onSubmit={(values) => {
                createTag.mutate(
                  {
                    name: values.name,
                    label: values.label || null,
                    color: values.color,
                    groupId: values.groupId,
                  },
                  { onSuccess: () => setShowAddForm(false) }
                );
              }}
            />
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              setEditingTagId(null);
              setShowAddForm(true);
            }}
            className="justify-start"
          >
            <Plus className="h-4 w-4" />
            {t('addTag')}
          </Button>
        )}

        {tagsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {sections.map((section) => (
              <div key={section.key}>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.name}
                </p>
                <div className="space-y-1">
                  {section.tags.map((tag) => {
                    const usedOn = usage[tag.id] || 0;

                    if (editingTagId === tag.id) {
                      return (
                        <div key={tag.id} className="rounded-lg border bg-muted/30 p-3">
                          <TagForm
                            groups={groups}
                            localizeGroupName={localizeGroupName}
                            initial={{
                              name: tag.name,
                              label: tag.label || '',
                              color: tag.color || 'slate',
                              groupId: tag.group?.id || defaultGroupId,
                            }}
                            isSaving={updateTag.isPending}
                            submitLabel={tCommon('save')}
                            onCancel={() => setEditingTagId(null)}
                            onSubmit={(values) => {
                              updateTag.mutate(
                                {
                                  id: tag.id,
                                  name: values.name,
                                  label: values.label || null,
                                  color: values.color,
                                  groupId: values.groupId,
                                },
                                { onSuccess: () => setEditingTagId(null) }
                              );
                            }}
                          />
                        </div>
                      );
                    }

                    return (
                      <div
                        key={tag.id}
                        className="flex items-center gap-2 rounded-lg border px-3 py-2"
                      >
                        <MenuTagBadge tag={tag} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{tag.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {t('usedOnDishes', { count: usedOn })}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          aria-label={t('editTag')}
                          onClick={() => {
                            setShowAddForm(false);
                            setEditingTagId(tag.id);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                          aria-label={t('deleteTag')}
                          onClick={() => setTagPendingDelete(tag)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {sections.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('noTagsYet')}</p>
            )}
          </div>
        )}
      </DialogContent>

      <AlertDialog
        open={!!tagPendingDelete}
        onOpenChange={(isOpen) => !isOpen && setTagPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('deleteTagTitle', { name: tagPendingDelete?.name || '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteTagDescription', {
                count: tagPendingDelete ? usage[tagPendingDelete.id] || 0 : 0,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (tagPendingDelete) deleteTag.mutate(tagPendingDelete.id);
                setTagPendingDelete(null);
              }}
            >
              {tCommon('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function TagForm({
  groups,
  localizeGroupName,
  initial,
  isSaving,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  groups: { id: string; name: string; slug: string }[];
  localizeGroupName: (group: { name: string; slug: string } | null) => string;
  initial: TagFormValues;
  isSaving: boolean;
  submitLabel: string;
  onSubmit: (values: TagFormValues) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('foodTags');
  const tCommon = useTranslations('common');
  const [values, setValues] = useState<TagFormValues>(initial);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">{t('tagName')}</Label>
          <Input
            value={values.name}
            onChange={(event) => setValues({ ...values, name: event.target.value })}
            placeholder={t('tagNamePlaceholder')}
            maxLength={40}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">
            {t('shortLabel')}{' '}
            <span className="font-normal text-muted-foreground">({tCommon('optional')})</span>
          </Label>
          <Input
            value={values.label}
            onChange={(event) =>
              setValues({ ...values, label: event.target.value.toUpperCase() })
            }
            placeholder={t('shortLabelPlaceholder')}
            maxLength={5}
            className="uppercase"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">{t('group')}</Label>
        <Select
          value={values.groupId}
          onValueChange={(groupId) => setValues({ ...values, groupId })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {localizeGroupName(group)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">{t('color')}</Label>
        <div className="flex flex-wrap gap-1.5">
          {MENU_TAG_COLOR_OPTIONS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              onClick={() => setValues({ ...values, color })}
              className={cn(
                'h-6 w-6 rounded-full transition-transform touch-manipulation',
                getTagDotClasses(color),
                values.color === color
                  ? 'scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-background'
                  : 'hover:scale-110'
              )}
            />
          ))}
        </div>
      </div>

      {values.name.trim() && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {t('preview')}:
          <MenuTagBadge
            tag={{ name: values.name, label: values.label || null, color: values.color }}
          />
          <MenuTagBadge
            tag={{ name: values.name, label: values.label || null, color: values.color }}
            showName
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
          {tCommon('cancel')}
        </Button>
        <Button
          size="sm"
          onClick={() => onSubmit(values)}
          disabled={!values.name.trim() || !values.groupId || isSaving}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
