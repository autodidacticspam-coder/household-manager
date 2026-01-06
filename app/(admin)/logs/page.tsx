'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { format, subDays, startOfMonth } from 'date-fns';
import { formatTime12h } from '@/lib/format-time';
import { parseLocalDate } from '@/lib/date-utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Baby, Utensils, Moon, Trash2, ClipboardList, Calendar, User, Plus, ShieldX, ShowerHead, Pencil } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useChildLogs, useCreateChildLog, useUpdateChildLog, useDeleteChildLog, useCanAccessChildLogs } from '@/hooks/use-child-logs';
import { useCurrentWeekMenu } from '@/hooks/use-menu';
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
  { value: 'shower', label: 'Shower', icon: ShowerHead, color: 'text-cyan-700', bgColor: 'bg-cyan-100' },
];

const CHILD_COLORS: Record<ChildName, { bg: string; text: string; ring: string }> = {
  'Zoe': { bg: 'bg-pink-100', text: 'text-pink-700', ring: 'ring-pink-500' },
  'Zara': { bg: 'bg-purple-100', text: 'text-purple-700', ring: 'ring-purple-500' },
  'Zander': { bg: 'bg-blue-100', text: 'text-blue-700', ring: 'ring-blue-500' },
};

// Date filter component extracted to avoid recreation on render
function DateFilterCard({
  startDate,
  endDate,
  setStartDate,
  setEndDate,
  t,
}: {
  startDate: string;
  endDate: string;
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  t: (key: string) => string;
}) {
  return (
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
}

// Convert 24-hour time to 12-hour input format (returns {time: "9:30", ampm: "PM"})
function parse24To12(time24: string | null): { time: string; ampm: 'AM' | 'PM' } {
  if (!time24) return { time: '', ampm: 'AM' };
  const [hours, minutes] = time24.slice(0, 5).split(':').map(Number);
  const ampm: 'AM' | 'PM' = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return { time: `${hours12}:${minutes.toString().padStart(2, '0')}`, ampm };
}

export default function UnifiedLogPage() {
  const t = useTranslations();

  // Access control
  const { data: canAccess, isLoading: accessLoading } = useCanAccessChildLogs();

  // View state
  const [activeTab, setActiveTab] = useState<'create' | 'all' | 'by-child' | 'by-category'>('create');
  const [selectedChild, setSelectedChild] = useState<ChildName | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ChildLogCategory | null>(null);
  // Use lazy initializers to avoid SSR timezone issues
  const [startDate, setStartDate] = useState(() => {
    if (typeof window === 'undefined') return '';
    return format(startOfMonth(new Date()), 'yyyy-MM-dd');
  });
  const [endDate, setEndDate] = useState(() => {
    if (typeof window === 'undefined') return '';
    return format(new Date(), 'yyyy-MM-dd');
  });

  // Redirect after log preference - use lazy initializer to avoid setState in effect
  const [redirectAfterLog] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('logs-redirect-after-entry') === 'true';
  });

  // Time prepopulate preferences (default to true) - use lazy initializer
  const [prepopulateSettings] = useState<Record<ChildLogCategory, boolean>>(() => {
    if (typeof window === 'undefined') {
      return { sleep: true, food: true, poop: true, shower: true };
    }
    const settings: Record<ChildLogCategory, boolean> = {
      sleep: true,
      food: true,
      poop: true,
      shower: true,
    };
    const categories: ChildLogCategory[] = ['sleep', 'food', 'poop', 'shower'];
    categories.forEach(cat => {
      const val = localStorage.getItem(`logs-prepopulate-${cat}-time`);
      if (val !== null) {
        settings[cat] = val === 'true';
      }
    });
    return settings;
  });

  // Helper to get current time in 12-hour format
  const getCurrentTime12h = () => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const hours12 = hours % 12 || 12;
    return `${hours12}:${minutes.toString().padStart(2, '0')}`;
  };

  const getCurrentAmPm = (): 'AM' | 'PM' => {
    return new Date().getHours() >= 12 ? 'PM' : 'AM';
  };

  // Create form state
  const [formChild, setFormChild] = useState<ChildName | ''>('');
  const [formCategory, setFormCategory] = useState<ChildLogCategory | ''>('');
  const [logDate, setLogDate] = useState(() => {
    if (typeof window === 'undefined') return '';
    return format(new Date(), 'yyyy-MM-dd');
  });
  const [startTime, setStartTime] = useState('');
  const [startAmPm, setStartAmPm] = useState<'AM' | 'PM'>('AM');
  const [endTime, setEndTime] = useState('');
  const [endAmPm, setEndAmPm] = useState<'AM' | 'PM'>('AM');
  const [logTimeInput, setLogTimeInput] = useState('');
  const [logAmPm, setLogAmPm] = useState<'AM' | 'PM'>('AM');
  const [description, setDescription] = useState('');

  // Handler for category selection that respects prepopulate settings
  const handleCategorySelect = (category: ChildLogCategory) => {
    setFormCategory(category);

    if (prepopulateSettings[category]) {
      // Prepopulate with current time
      const currentTime = getCurrentTime12h();
      const currentAmPm = getCurrentAmPm();

      if (category === 'sleep') {
        setStartTime(currentTime);
        setStartAmPm(currentAmPm);
        setEndTime(currentTime);
        setEndAmPm(currentAmPm);
      } else {
        setLogTimeInput(currentTime);
        setLogAmPm(currentAmPm);
      }
    } else {
      // Leave time blank
      if (category === 'sleep') {
        setStartTime('');
        setStartAmPm('AM');
        setEndTime('');
        setEndAmPm('AM');
      } else {
        setLogTimeInput('');
        setLogAmPm('AM');
      }
    }
  };

  // Convert 12-hour to 24-hour format
  const to24Hour = (time12: string, ampm: 'AM' | 'PM'): string => {
    if (!time12) return '';
    const [hourStr, minStr] = time12.split(':');
    let hour = parseInt(hourStr, 10) || 0;
    const min = minStr || '00';
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, '0')}:${min.padStart(2, '0')}`;
  };

  // Build filters based on selection
  const filters = {
    child: activeTab === 'by-child' ? selectedChild || undefined : undefined,
    category: activeTab === 'by-category' ? selectedCategory || undefined : undefined,
    startDate: activeTab !== 'create' ? startDate : undefined,
    endDate: activeTab !== 'create' ? endDate : undefined,
  };

  const { data: logs, isLoading: logsLoading } = useChildLogs(activeTab !== 'create' ? filters : undefined);
  const createLog = useCreateChildLog();
  const updateLog = useUpdateChildLog();
  const deleteLog = useDeleteChildLog();

  // Get current week's menu for food suggestions
  const { data: weeklyMenu } = useCurrentWeekMenu();

  // Words to filter out from menu suggestions
  const FILTERED_WORDS = ['zara', 'zander', 'adults', 'kids', 'none', 'this day', 'prepped', 'adult'];

  // Check if a string should be filtered out
  const shouldFilterItem = (text: string): boolean => {
    const lower = text.toLowerCase().trim();

    // Filter if contains any filtered words
    if (FILTERED_WORDS.some(word => lower.includes(word))) {
      return true;
    }

    // Filter if it's just a number or starts with a number followed by space (like "5 Adults")
    if (/^\d+\s/.test(text) || /^\d+$/.test(text)) {
      return true;
    }

    // Filter if too short (less than 3 characters)
    if (lower.length < 3) {
      return true;
    }

    return false;
  };

  // Parse menu items from a meal string (split by newlines first, then commas)
  const parseMenuItems = (mealStr: string): string[] => {
    if (!mealStr || !mealStr.trim()) return [];

    // First split by newlines to get each line
    const lines = mealStr.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    const items: string[] = [];
    for (const line of lines) {
      // Check if line should be filtered - skip entire line
      if (shouldFilterItem(line)) {
        continue;
      }

      // If line has commas, split further; otherwise use the whole line
      if (line.includes(',')) {
        const subItems = line.split(',').map(s => s.trim()).filter(s => s.length > 0);
        for (const subItem of subItems) {
          // Double check each sub-item
          if (!shouldFilterItem(subItem)) {
            items.push(subItem);
          }
        }
      } else {
        items.push(line);
      }
    }

    return items;
  };

  // Get sorted menu suggestions for food logs
  const getMenuSuggestions = () => {
    if (!weeklyMenu?.meals || !Array.isArray(weeklyMenu.meals)) return [];

    const items: string[] = [];

    // Process all days in the meals array
    for (const dayMeals of weeklyMenu.meals) {
      if (!dayMeals) continue;

      // Process all meal types
      for (const meal of ['breakfast', 'lunch', 'dinner', 'snacks'] as const) {
        const mealContent = dayMeals[meal];
        if (!mealContent) continue;

        const parsedItems = parseMenuItems(mealContent);
        for (const item of parsedItems) {
          // Avoid duplicates (case-insensitive)
          if (!items.some(existing => existing.toLowerCase() === item.toLowerCase())) {
            items.push(item);
          }
        }
      }
    }

    // Sort alphabetically
    items.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    return items;
  };

  // Add menu item to description
  const addMenuItemToDescription = (item: string) => {
    setDescription(prev => {
      if (!prev.trim()) return item;
      // Check if item is already in description
      if (prev.toLowerCase().includes(item.toLowerCase())) return prev;
      return `${prev}, ${item}`;
    });
  };

  // Edit state
  const [editingLog, setEditingLog] = useState<ChildLogWithUser | null>(null);
  const [editChild, setEditChild] = useState<ChildName | ''>('');
  const [editCategory, setEditCategory] = useState<ChildLogCategory | ''>('');
  const [editDate, setEditDate] = useState('');
  const [editLogTime, setEditLogTime] = useState('');
  const [editLogAmPm, setEditLogAmPm] = useState<'AM' | 'PM'>('AM');
  const [editStartTime, setEditStartTime] = useState('');
  const [editStartAmPm, setEditStartAmPm] = useState<'AM' | 'PM'>('PM');
  const [editEndTime, setEditEndTime] = useState('');
  const [editEndAmPm, setEditEndAmPm] = useState<'AM' | 'PM'>('AM');
  const [editDescription, setEditDescription] = useState('');

  // Open edit dialog with log data
  const openEditDialog = (log: ChildLogWithUser) => {
    setEditingLog(log);
    setEditChild(log.child);
    setEditCategory(log.category);
    setEditDate(log.logDate);
    setEditDescription(log.description || '');

    if (log.category === 'sleep') {
      const startParsed = parse24To12(log.startTime);
      const endParsed = parse24To12(log.endTime);
      setEditStartTime(startParsed.time);
      setEditStartAmPm(startParsed.ampm);
      setEditEndTime(endParsed.time);
      setEditEndAmPm(endParsed.ampm);
      setEditLogTime('');
      setEditLogAmPm('AM');
    } else {
      const timeParsed = parse24To12(log.logTime);
      setEditLogTime(timeParsed.time);
      setEditLogAmPm(timeParsed.ampm);
      setEditStartTime('');
      setEditEndTime('');
    }
  };

  // Handle edit submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLog || !editChild || !editCategory) return;

    const startTime24 = to24Hour(editStartTime, editStartAmPm);
    const endTime24 = to24Hour(editEndTime, editEndAmPm);
    const logTime24 = to24Hour(editLogTime, editLogAmPm);
    // For sleep logs, use start time if available, otherwise end time
    const effectiveLogTime = editCategory === 'sleep'
      ? (startTime24 || endTime24 || logTime24)
      : logTime24;

    await updateLog.mutateAsync({
      id: editingLog.id,
      child: editChild,
      category: editCategory,
      logDate: editDate,
      logTime: effectiveLogTime,
      startTime: editCategory === 'sleep' ? startTime24 || null : null,
      endTime: editCategory === 'sleep' ? endTime24 || null : null,
      description: editDescription || null,
    });

    setEditingLog(null);
  };

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

    const startTime24 = to24Hour(startTime, startAmPm);
    const endTime24 = to24Hour(endTime, endAmPm);
    const logTime24 = to24Hour(logTimeInput, logAmPm);
    // For sleep logs, use start time if available, otherwise end time
    const effectiveLogTime = formCategory === 'sleep'
      ? (startTime24 || endTime24 || logTime24)
      : logTime24;

    await createLog.mutateAsync({
      child: formChild,
      category: formCategory,
      logDate,
      logTime: effectiveLogTime,
      startTime: formCategory === 'sleep' ? startTime24 || null : null,
      endTime: formCategory === 'sleep' ? endTime24 || null : null,
      description: description || null,
    });

    // Reset form (time will be populated when category is selected next)
    setFormChild('');
    setFormCategory('');
    setDescription('');
    setLogTimeInput('');
    setLogAmPm('AM');
    setStartTime('');
    setStartAmPm('AM');
    setEndTime('');
    setEndAmPm('AM');

    // Redirect to all logs tab if setting is enabled
    if (redirectAfterLog) {
      setActiveTab('all');
    }
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
            {log.category === 'sleep' ? (
              log.startTime && log.endTime ? (
                <span>{formatTime12h(log.startTime)} - {formatTime12h(log.endTime)}</span>
              ) : log.startTime && !log.endTime ? (
                <span>{t('childLogs.putToBed')} {formatTime12h(log.startTime)}</span>
              ) : log.endTime && !log.startTime ? (
                <span>{t('childLogs.wokeUp')} {formatTime12h(log.endTime)}</span>
              ) : (
                <span>{formatTime12h(log.logTime)}</span>
              )
            ) : (
              <span>{formatTime12h(log.logTime)}</span>
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
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary"
          onClick={() => openEditDialog(log)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
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
    </div>
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
                          onClick={() => handleCategorySelect(cat.value)}
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
                      <div className="flex gap-2">
                        <Input
                          id="startTime"
                          type="text"
                          inputMode="numeric"
                          placeholder="9:30"
                          value={startTime}
                          onChange={(e) => {
                            let val = e.target.value.replace(/[^\d:]/g, '');
                            if (val.length === 2 && !val.includes(':') && startTime.length < val.length) {
                              val = val + ':';
                            }
                            if (val.length <= 5) setStartTime(val);
                          }}
                          className="flex-1"
                        />
                        <div className="flex rounded-md border overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setStartAmPm('AM')}
                            className={`px-3 py-2 text-sm font-medium transition-colors ${
                              startTime && startAmPm === 'AM'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-background hover:bg-muted'
                            }`}
                          >
                            AM
                          </button>
                          <button
                            type="button"
                            onClick={() => setStartAmPm('PM')}
                            className={`px-3 py-2 text-sm font-medium transition-colors ${
                              startTime && startAmPm === 'PM'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-background hover:bg-muted'
                            }`}
                          >
                            PM
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endTime">{t('childLogs.sleepEnd')}</Label>
                      <div className="flex gap-2">
                        <Input
                          id="endTime"
                          type="text"
                          inputMode="numeric"
                          placeholder="7:00"
                          value={endTime}
                          onChange={(e) => {
                            let val = e.target.value.replace(/[^\d:]/g, '');
                            if (val.length === 2 && !val.includes(':') && endTime.length < val.length) {
                              val = val + ':';
                            }
                            if (val.length <= 5) setEndTime(val);
                          }}
                          className="flex-1"
                        />
                        <div className="flex rounded-md border overflow-hidden">
                          <button
                            type="button"
                            onClick={() => setEndAmPm('AM')}
                            className={`px-3 py-2 text-sm font-medium transition-colors ${
                              endTime && endAmPm === 'AM'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-background hover:bg-muted'
                            }`}
                          >
                            AM
                          </button>
                          <button
                            type="button"
                            onClick={() => setEndAmPm('PM')}
                            className={`px-3 py-2 text-sm font-medium transition-colors ${
                              endTime && endAmPm === 'PM'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-background hover:bg-muted'
                            }`}
                          >
                            PM
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="logTime">{t('common.time')}</Label>
                    <div className="flex gap-2">
                      <Input
                        id="logTime"
                        type="text"
                        inputMode="numeric"
                        placeholder="12:30"
                        value={logTimeInput}
                        onChange={(e) => {
                          let val = e.target.value.replace(/[^\d:]/g, '');
                          if (val.length === 2 && !val.includes(':') && logTimeInput.length < val.length) {
                            val = val + ':';
                          }
                          if (val.length <= 5) setLogTimeInput(val);
                        }}
                        className="flex-1"
                        required
                      />
                      <div className="flex rounded-md border overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setLogAmPm('AM')}
                          className={`px-3 py-2 text-sm font-medium transition-colors ${
                            logTimeInput && logAmPm === 'AM'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-background hover:bg-muted'
                          }`}
                        >
                          AM
                        </button>
                        <button
                          type="button"
                          onClick={() => setLogAmPm('PM')}
                          className={`px-3 py-2 text-sm font-medium transition-colors ${
                            logTimeInput && logAmPm === 'PM'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-background hover:bg-muted'
                          }`}
                        >
                          PM
                        </button>
                      </div>
                    </div>
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

                {/* Menu suggestions for food logs - quick add */}
                {formCategory === 'food' && (() => {
                  const suggestions = getMenuSuggestions();
                  if (suggestions.length === 0) return null;

                  return (
                    <div className="space-y-2 pt-2 border-t">
                      <p className="text-xs text-muted-foreground">{t('childLogs.menuSuggestions')}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((item, idx) => {
                          const isSelected = description.toLowerCase().includes(item.toLowerCase());
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => addMenuItemToDescription(item)}
                              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                                isSelected
                                  ? 'bg-orange-500 text-white ring-2 ring-orange-300 ring-offset-1'
                                  : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                              }`}
                            >
                              {item}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* All Logs View */}
        <TabsContent value="all" className="mt-6">
          <DateFilterCard startDate={startDate} endDate={endDate} setStartDate={setStartDate} setEndDate={setEndDate} t={t} />
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
                      {format(parseLocalDate(date), 'EEEE, MMMM d, yyyy')}
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
          <DateFilterCard startDate={startDate} endDate={endDate} setStartDate={setStartDate} setEndDate={setEndDate} t={t} />
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
                          {format(parseLocalDate(date), 'EEEE, MMMM d')}
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
          <DateFilterCard startDate={startDate} endDate={endDate} setStartDate={setStartDate} setEndDate={setEndDate} t={t} />
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
                          {format(parseLocalDate(date), 'EEEE, MMMM d')}
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

      {/* Edit Dialog */}
      <Dialog open={!!editingLog} onOpenChange={(open) => !open && setEditingLog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('childLogs.editLog')}</DialogTitle>
            <DialogDescription>
              {t('childLogs.newLogDescription')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
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
                      variant={editChild === child ? 'default' : 'outline'}
                      onClick={() => setEditChild(child)}
                      className={`flex-1 ${editChild !== child ? colors.bg + ' ' + colors.text + ' border-0 hover:opacity-80' : ''}`}
                      size="sm"
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
                      variant={editCategory === cat.value ? 'default' : 'outline'}
                      onClick={() => setEditCategory(cat.value)}
                      className={`flex-1 gap-1 ${editCategory !== cat.value ? cat.bgColor + ' ' + cat.color + ' border-0 hover:opacity-80' : ''}`}
                      size="sm"
                    >
                      <Icon className="h-3 w-3" />
                      <span className="hidden sm:inline">{t(`childLogs.categories.${cat.value}`)}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            {/* Date */}
            <div className="space-y-2">
              <Label htmlFor="editDate">{t('common.date')}</Label>
              <Input
                id="editDate"
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                required
              />
            </div>

            {/* Time - different for sleep vs other */}
            {editCategory === 'sleep' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="editStartTime">{t('childLogs.sleepStart')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="editStartTime"
                      type="text"
                      inputMode="numeric"
                      placeholder="9:30"
                      value={editStartTime}
                      onChange={(e) => {
                        let val = e.target.value.replace(/[^\d:]/g, '');
                        if (val.length === 2 && !val.includes(':') && editStartTime.length < val.length) {
                          val = val + ':';
                        }
                        if (val.length <= 5) setEditStartTime(val);
                      }}
                      className="flex-1"
                    />
                    <div className="flex rounded-md border overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setEditStartAmPm('AM')}
                        className={`px-2 py-1 text-xs font-medium transition-colors ${
                          editStartAmPm === 'AM'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background hover:bg-muted'
                        }`}
                      >
                        AM
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditStartAmPm('PM')}
                        className={`px-2 py-1 text-xs font-medium transition-colors ${
                          editStartAmPm === 'PM'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background hover:bg-muted'
                        }`}
                      >
                        PM
                      </button>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editEndTime">{t('childLogs.sleepEnd')}</Label>
                  <div className="flex gap-2">
                    <Input
                      id="editEndTime"
                      type="text"
                      inputMode="numeric"
                      placeholder="7:00"
                      value={editEndTime}
                      onChange={(e) => {
                        let val = e.target.value.replace(/[^\d:]/g, '');
                        if (val.length === 2 && !val.includes(':') && editEndTime.length < val.length) {
                          val = val + ':';
                        }
                        if (val.length <= 5) setEditEndTime(val);
                      }}
                      className="flex-1"
                    />
                    <div className="flex rounded-md border overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setEditEndAmPm('AM')}
                        className={`px-2 py-1 text-xs font-medium transition-colors ${
                          editEndAmPm === 'AM'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background hover:bg-muted'
                        }`}
                      >
                        AM
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditEndAmPm('PM')}
                        className={`px-2 py-1 text-xs font-medium transition-colors ${
                          editEndAmPm === 'PM'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background hover:bg-muted'
                        }`}
                      >
                        PM
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="editLogTime">{t('common.time')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="editLogTime"
                    type="text"
                    inputMode="numeric"
                    placeholder="12:30"
                    value={editLogTime}
                    onChange={(e) => {
                      let val = e.target.value.replace(/[^\d:]/g, '');
                      if (val.length === 2 && !val.includes(':') && editLogTime.length < val.length) {
                        val = val + ':';
                      }
                      if (val.length <= 5) setEditLogTime(val);
                    }}
                    className="flex-1"
                    required
                  />
                  <div className="flex rounded-md border overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setEditLogAmPm('AM')}
                      className={`px-3 py-2 text-sm font-medium transition-colors ${
                        editLogAmPm === 'AM'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background hover:bg-muted'
                      }`}
                    >
                      AM
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditLogAmPm('PM')}
                      className={`px-3 py-2 text-sm font-medium transition-colors ${
                        editLogAmPm === 'PM'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background hover:bg-muted'
                      }`}
                    >
                      PM
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="editDescription">{t('childLogs.descriptionOptional')}</Label>
              <Textarea
                id="editDescription"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder={t('childLogs.descriptionPlaceholder')}
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingLog(null)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={!editChild || !editCategory || updateLog.isPending}
              >
                {updateLog.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common.saving')}
                  </>
                ) : (
                  t('childLogs.updateLog')
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
