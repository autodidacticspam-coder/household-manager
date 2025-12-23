'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { format, subDays, startOfMonth } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Baby, Utensils, Moon, Trash2, ClipboardList, Calendar, User, Plus, ShieldX } from 'lucide-react';
import { useChildLogs, useCreateChildLog, useDeleteChildLog, useCanAccessChildLogs } from '@/hooks/use-child-logs';
import type { ChildName, ChildLogCategory, ChildLogWithUser } from '@/types';
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
const CATEGORIES: { value: ChildLogCategory; label: string; icon: typeof Baby; color: string; bgColor: string }[] = [
  { value: 'sleep', label: 'Sleep', icon: Moon, color: 'text-indigo-700', bgColor: 'bg-indigo-100' },
  { value: 'food', label: 'Food', icon: Utensils, color: 'text-orange-700', bgColor: 'bg-orange-100' },
  { value: 'poop', label: 'Poop', icon: Baby, color: 'text-amber-700', bgColor: 'bg-amber-100' },
];

const CHILD_COLORS: Record<ChildName, { bg: string; text: string; ring: string }> = {
  'Zoe': { bg: 'bg-pink-100', text: 'text-pink-700', ring: 'ring-pink-500' },
  'Zara': { bg: 'bg-purple-100', text: 'text-purple-700', ring: 'ring-purple-500' },
  'Zander': { bg: 'bg-blue-100', text: 'text-blue-700', ring: 'ring-blue-500' },
};

export default function UnifiedLogPage() {
  const t = useTranslations();

  // Access control
  const { data: canAccess, isLoading: accessLoading } = useCanAccessChildLogs();

  // View state
  const [activeTab, setActiveTab] = useState<'create' | 'all' | 'by-child' | 'by-category'>('create');
  const [selectedChild, setSelectedChild] = useState<ChildName | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ChildLogCategory | null>(null);
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Create form state
  const [formChild, setFormChild] = useState<ChildName | ''>('');
  const [formCategory, setFormCategory] = useState<ChildLogCategory | ''>('');
  const [logDate, setLogDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [logTime, setLogTime] = useState(format(new Date(), 'HH:mm'));
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [description, setDescription] = useState('');

  // Build filters based on selection
  const filters = {
    child: activeTab === 'by-child' ? selectedChild || undefined : undefined,
    category: activeTab === 'by-category' ? selectedCategory || undefined : undefined,
    startDate: activeTab !== 'create' ? startDate : undefined,
    endDate: activeTab !== 'create' ? endDate : undefined,
  };

  const { data: logs, isLoading: logsLoading } = useChildLogs(activeTab !== 'create' ? filters : undefined);
  const createLog = useCreateChildLog();
  const deleteLog = useDeleteChildLog();

  // Show loading while checking access
  if (accessLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show access denied if user doesn't have permission
  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <ShieldX className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
        <p className="text-muted-foreground max-w-md">
          Child logs are only accessible to Administrators, Nannies, and Teachers.
        </p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formChild || !formCategory) return;

    const effectiveLogTime = formCategory === 'sleep' && startTime ? startTime : logTime;

    await createLog.mutateAsync({
      child: formChild,
      category: formCategory,
      logDate,
      logTime: effectiveLogTime,
      startTime: formCategory === 'sleep' ? startTime || null : null,
      endTime: formCategory === 'sleep' ? endTime || null : null,
      description: description || null,
    });

    // Reset form
    setFormChild('');
    setFormCategory('');
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

  const getCategoryStyle = (category: ChildLogCategory) => {
    const cat = CATEGORIES.find(c => c.value === category);
    return cat ? `${cat.bgColor} ${cat.color}` : 'bg-gray-100 text-gray-700';
  };

  const getChildStyle = (child: ChildName) => {
    const colors = CHILD_COLORS[child];
    return `${colors.bg} ${colors.text}`;
  };

  // Group logs by date for better display
  const groupedLogs = logs?.reduce((groups, log) => {
    const date = log.logDate;
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(log);
    return groups;
  }, {} as Record<string, ChildLogWithUser[]>) || {};

  const LogCard = ({ log }: { log: ChildLogWithUser }) => (
    <div className="flex items-start justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      <div className="flex items-start gap-3">
        <Badge className={getCategoryStyle(log.category)}>
          {getCategoryIcon(log.category)}
        </Badge>
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={getChildStyle(log.child)}>
              {log.child}
            </Badge>
            <span className="font-medium">{t(`childLogs.categories.${log.category}`)}</span>
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {log.category === 'sleep' && log.startTime && log.endTime ? (
              <span>{log.startTime.slice(0, 5)} - {log.endTime.slice(0, 5)}</span>
            ) : (
              <span>{log.logTime.slice(0, 5)}</span>
            )}
          </div>
          {log.description && (
            <p className="text-sm mt-2 text-muted-foreground">{log.description}</p>
          )}
          {log.loggedByUser && (
            <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
              <Avatar className="h-4 w-4">
                <AvatarImage src={log.loggedByUser.avatarUrl || undefined} />
                <AvatarFallback className="text-[8px]">
                  {log.loggedByUser.fullName?.[0]}
                </AvatarFallback>
              </Avatar>
              <span>{t('childLogs.loggedBy')}: {log.loggedByUser.fullName}</span>
            </div>
          )}
        </div>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
            <Trash2 className="h-4 w-4" />
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
  );

  const DateFilterCard = () => (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="startDate">{t('leave.startDate')}</Label>
            <Input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate">{t('leave.endDate')}</Label>
            <Input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStartDate(format(new Date(), 'yyyy-MM-dd'));
                setEndDate(format(new Date(), 'yyyy-MM-dd'));
              }}
            >
              {t('common.today')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStartDate(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
                setEndDate(format(new Date(), 'yyyy-MM-dd'));
              }}
            >
              {t('common.thisWeek')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
                setEndDate(format(new Date(), 'yyyy-MM-dd'));
              }}
            >
              {t('common.thisMonth')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ClipboardList className="h-6 w-6" />
          {t('childLogs.title')}
        </h1>
        <p className="text-muted-foreground">{t('childLogs.description')}</p>
      </div>

      {/* Tabs for different views */}
      <Tabs value={activeTab} onValueChange={(v) => {
        setActiveTab(v as typeof activeTab);
        if (v !== 'by-child') setSelectedChild(null);
        if (v !== 'by-category') setSelectedCategory(null);
      }}>
        <TabsList className="grid w-full grid-cols-4 lg:w-[500px]">
          <TabsTrigger value="create" className="gap-2">
            <Plus className="h-4 w-4" />
            New Log
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-2">
            <Calendar className="h-4 w-4" />
            {t('common.all')}
          </TabsTrigger>
          <TabsTrigger value="by-child" className="gap-2">
            <User className="h-4 w-4" />
            By Child
          </TabsTrigger>
          <TabsTrigger value="by-category" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            By Type
          </TabsTrigger>
        </TabsList>

        {/* Create Log Tab */}
        <TabsContent value="create" className="mt-6">
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
                    {CHILDREN.map((child) => {
                      const colors = CHILD_COLORS[child];
                      return (
                        <Button
                          key={child}
                          type="button"
                          variant={formChild === child ? 'default' : 'outline'}
                          onClick={() => setFormChild(child)}
                          className={`flex-1 ${formChild !== child ? colors.bg + ' ' + colors.text + ' border-0 hover:opacity-80' : ''}`}
                        >
                          {child}
                        </Button>
                      );
                    })}
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
                          variant={formCategory === cat.value ? 'default' : 'outline'}
                          onClick={() => setFormCategory(cat.value)}
                          className={`flex-1 gap-2 ${formCategory !== cat.value ? cat.bgColor + ' ' + cat.color + ' border-0 hover:opacity-80' : ''}`}
                        >
                          <Icon className="h-4 w-4" />
                          {t(`childLogs.categories.${cat.value}`)}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                {/* Date */}
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

                {/* Time - different for sleep vs other */}
                {formCategory === 'sleep' ? (
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
                  disabled={!formChild || !formCategory || createLog.isPending}
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
        </TabsContent>

        {/* All Logs View */}
        <TabsContent value="all" className="mt-6">
          <DateFilterCard />
          {logsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : logs && logs.length > 0 ? (
            <div className="space-y-6">
              {Object.entries(groupedLogs)
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([date, dateLogs]) => (
                  <div key={date}>
                    <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                      <Badge variant="secondary">{dateLogs.length} logs</Badge>
                    </h3>
                    <div className="space-y-2">
                      {dateLogs.map((log) => (
                        <LogCard key={log.id} log={log} />
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                {t('childLogs.noLogs')}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* By Child View */}
        <TabsContent value="by-child" className="mt-6">
          <DateFilterCard />
          <div className="grid gap-6 lg:grid-cols-4">
            {/* Child Selection Sidebar */}
            <Card className="lg:col-span-1 h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Select Child</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {CHILDREN.map((child) => {
                  const colors = CHILD_COLORS[child];
                  const isSelected = selectedChild === child;
                  return (
                    <Button
                      key={child}
                      variant={isSelected ? 'default' : 'outline'}
                      className={`w-full justify-start gap-2 ${isSelected ? '' : colors.bg + ' ' + colors.text + ' border-0'}`}
                      onClick={() => setSelectedChild(isSelected ? null : child)}
                    >
                      <User className="h-4 w-4" />
                      {child}
                    </Button>
                  );
                })}
              </CardContent>
            </Card>

            {/* Logs for Selected Child */}
            <div className="lg:col-span-3">
              {!selectedChild ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    Select a child to view their logs
                  </CardContent>
                </Card>
              ) : logsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : logs && logs.length > 0 ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <Badge className={`${CHILD_COLORS[selectedChild].bg} ${CHILD_COLORS[selectedChild].text} text-lg px-4 py-2`}>
                      {selectedChild}
                    </Badge>
                    <span className="text-muted-foreground">{logs.length} logs</span>
                  </div>
                  {Object.entries(groupedLogs)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .map(([date, dateLogs]) => (
                      <div key={date}>
                        <h3 className="font-medium text-sm text-muted-foreground mb-2">
                          {format(new Date(date), 'EEEE, MMMM d')}
                        </h3>
                        <div className="space-y-2">
                          {dateLogs.map((log) => (
                            <LogCard key={log.id} log={log} />
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    No logs found for {selectedChild}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* By Category View */}
        <TabsContent value="by-category" className="mt-6">
          <DateFilterCard />
          <div className="grid gap-6 lg:grid-cols-4">
            {/* Category Selection Sidebar */}
            <Card className="lg:col-span-1 h-fit">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Select Type</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isSelected = selectedCategory === cat.value;
                  return (
                    <Button
                      key={cat.value}
                      variant={isSelected ? 'default' : 'outline'}
                      className={`w-full justify-start gap-2 ${isSelected ? '' : cat.bgColor + ' ' + cat.color + ' border-0'}`}
                      onClick={() => setSelectedCategory(isSelected ? null : cat.value)}
                    >
                      <Icon className="h-4 w-4" />
                      {t(`childLogs.categories.${cat.value}`)}
                    </Button>
                  );
                })}
              </CardContent>
            </Card>

            {/* Logs for Selected Category */}
            <div className="lg:col-span-3">
              {!selectedCategory ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    Select a category to view logs
                  </CardContent>
                </Card>
              ) : logsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : logs && logs.length > 0 ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    {(() => {
                      const cat = CATEGORIES.find(c => c.value === selectedCategory);
                      const Icon = cat?.icon || ClipboardList;
                      return (
                        <Badge className={`${cat?.bgColor} ${cat?.color} text-lg px-4 py-2 gap-2`}>
                          <Icon className="h-5 w-5" />
                          {t(`childLogs.categories.${selectedCategory}`)}
                        </Badge>
                      );
                    })()}
                    <span className="text-muted-foreground">{logs.length} logs</span>
                  </div>
                  {Object.entries(groupedLogs)
                    .sort(([a], [b]) => b.localeCompare(a))
                    .map(([date, dateLogs]) => (
                      <div key={date}>
                        <h3 className="font-medium text-sm text-muted-foreground mb-2">
                          {format(new Date(date), 'EEEE, MMMM d')}
                        </h3>
                        <div className="space-y-2">
                          {dateLogs.map((log) => (
                            <LogCard key={log.id} log={log} />
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    No {t(`childLogs.categories.${selectedCategory}`).toLowerCase()} logs found
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
