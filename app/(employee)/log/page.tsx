'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Baby, Utensils, Moon, Plus, Trash2 } from 'lucide-react';
import { useChildLogs, useCreateChildLog, useDeleteChildLog, useRecentChildLogs } from '@/hooks/use-child-logs';
import type { ChildName, ChildLogCategory } from '@/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const CHILDREN: ChildName[] = ['Zoe', 'Zara', 'Zander'];
const CATEGORIES: { value: ChildLogCategory; label: string; icon: typeof Baby; color: string }[] = [
  { value: 'sleep', label: 'Sleep', icon: Moon, color: 'bg-indigo-100 text-indigo-700' },
  { value: 'food', label: 'Food', icon: Utensils, color: 'bg-orange-100 text-orange-700' },
  { value: 'poop', label: 'Poop', icon: Baby, color: 'bg-amber-100 text-amber-700' },
];

export default function LogPage() {
  const t = useTranslations();
  const [selectedChild, setSelectedChild] = useState<ChildName | ''>('');
  const [selectedCategory, setSelectedCategory] = useState<ChildLogCategory | ''>('');
  const [logDate, setLogDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [logTime, setLogTime] = useState(format(new Date(), 'HH:mm'));
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [description, setDescription] = useState('');

  const { data: recentLogs, isLoading: logsLoading } = useRecentChildLogs(20);
  const createLog = useCreateChildLog();
  const deleteLog = useDeleteChildLog();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChild || !selectedCategory) return;

    // For sleep, use startTime as the logTime if provided
    const effectiveLogTime = selectedCategory === 'sleep' && startTime ? startTime : logTime;

    await createLog.mutateAsync({
      child: selectedChild,
      category: selectedCategory,
      logDate,
      logTime: effectiveLogTime,
      startTime: selectedCategory === 'sleep' ? startTime || null : null,
      endTime: selectedCategory === 'sleep' ? endTime || null : null,
      description: description || null,
    });

    // Reset form
    setSelectedChild('');
    setSelectedCategory('');
    setDescription('');
    setLogTime(format(new Date(), 'HH:mm'));
    setStartTime('');
    setEndTime('');
  };

  const getCategoryIcon = (category: ChildLogCategory) => {
    const cat = CATEGORIES.find(c => c.value === category);
    if (!cat) return null;
    const Icon = cat.icon;
    return <Icon className="h-4 w-4" />;
  };

  const getCategoryColor = (category: ChildLogCategory) => {
    const cat = CATEGORIES.find(c => c.value === category);
    return cat?.color || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('childLogs.title')}</h1>
        <p className="text-muted-foreground">{t('childLogs.description')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Log Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              {t('childLogs.newLog')}
            </CardTitle>
            <CardDescription>{t('childLogs.newLogDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Child Selection */}
              <div className="space-y-2">
                <Label>{t('childLogs.selectChild')}</Label>
                <div className="flex gap-2">
                  {CHILDREN.map((child) => (
                    <Button
                      key={child}
                      type="button"
                      variant={selectedChild === child ? 'default' : 'outline'}
                      onClick={() => setSelectedChild(child)}
                      className="flex-1"
                    >
                      {child}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Category Selection */}
              <div className="space-y-2">
                <Label>{t('childLogs.selectCategory')}</Label>
                <div className="flex gap-2">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <Button
                        key={cat.value}
                        type="button"
                        variant={selectedCategory === cat.value ? 'default' : 'outline'}
                        onClick={() => setSelectedCategory(cat.value)}
                        className="flex-1 gap-2"
                      >
                        <Icon className="h-4 w-4" />
                        {t(`childLogs.categories.${cat.value}`)}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Date and Time */}
              <div className="space-y-2">
                <Label htmlFor="logDate">{t('common.date')}</Label>
                <Input
                  id="logDate"
                  type="date"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  required
                />
              </div>

              {selectedCategory === 'sleep' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="startTime">{t('childLogs.sleepStart')}</Label>
                    <Input
                      id="startTime"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="endTime">{t('childLogs.sleepEnd')}</Label>
                    <Input
                      id="endTime"
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      required
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="logTime">{t('common.time')}</Label>
                  <Input
                    id="logTime"
                    type="time"
                    value={logTime}
                    onChange={(e) => setLogTime(e.target.value)}
                    required
                  />
                </div>
              )}

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">{t('childLogs.descriptionOptional')}</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('childLogs.descriptionPlaceholder')}
                  rows={3}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={!selectedChild || !selectedCategory || createLog.isPending}
              >
                {createLog.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common.saving')}
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('childLogs.addLog')}
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Recent Logs */}
        <Card>
          <CardHeader>
            <CardTitle>{t('childLogs.recentLogs')}</CardTitle>
            <CardDescription>{t('childLogs.recentLogsDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {logsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : recentLogs && recentLogs.length > 0 ? (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {recentLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start justify-between p-3 rounded-lg border bg-card"
                  >
                    <div className="flex items-start gap-3">
                      <Badge className={getCategoryColor(log.category)}>
                        {getCategoryIcon(log.category)}
                      </Badge>
                      <div>
                        <div className="font-medium">
                          {log.child} - {t(`childLogs.categories.${log.category}`)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(log.logDate), 'MMM d, yyyy')}
                          {log.category === 'sleep' && log.startTime && log.endTime ? (
                            <> {log.startTime.slice(0, 5)} - {log.endTime.slice(0, 5)}</>
                          ) : (
                            <> at {log.logTime.slice(0, 5)}</>
                          )}
                        </div>
                        {log.description && (
                          <p className="text-sm mt-1">{log.description}</p>
                        )}
                        {log.loggedByUser && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <Avatar className="h-4 w-4">
                              <AvatarImage src={log.loggedByUser.avatarUrl || undefined} />
                              <AvatarFallback className="text-[8px]">
                                {log.loggedByUser.fullName?.[0]}
                              </AvatarFallback>
                            </Avatar>
                            {log.loggedByUser.fullName}
                          </div>
                        )}
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('childLogs.deleteConfirmation')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteLog.mutate(log.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {t('common.delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {t('childLogs.noLogs')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
