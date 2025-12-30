'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { format, startOfWeek, addDays, addWeeks, subWeeks, isToday } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Loader2, Edit2, Save, X, UtensilsCrossed, ClipboardPaste, ChevronLeft, ChevronRight, Star, MessageSquare, Send, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useWeeklyMenu, useUpdateMenu, useCanEditMenu } from '@/hooks/use-menu';
import { useMenuRatings, useRateMenuItem, useDeleteMenuRating, type MenuRating } from '@/hooks/use-menu-ratings';
import { useCreateFoodRequest } from '@/hooks/use-food-requests';
import { useAuth } from '@/contexts/auth-context';
import type { DayMeals, DayOfWeek } from '@/types';
import { cn } from '@/lib/utils';

const DAYS: Array<{ key: keyof Omit<DayMeals, 'day'>; label: string }> = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];

const DAY_NAMES: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Rating selector component
function RatingSelector({
  menuItem,
  weekStart,
  dayOfWeek,
  mealType,
  currentRating,
}: {
  menuItem: string;
  weekStart: string;
  dayOfWeek: string;
  mealType: string;
  currentRating?: MenuRating;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [comment, setComment] = useState(currentRating?.comment || '');
  const [selectedRating, setSelectedRating] = useState<number | null>(currentRating?.rating || null);
  const rateMenuItem = useRateMenuItem();
  const deleteRating = useDeleteMenuRating();

  // Reset state when popover opens
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setComment(currentRating?.comment || '');
      setSelectedRating(currentRating?.rating || null);
    }
  };

  const handleRate = (rating: number) => {
    setSelectedRating(rating);
  };

  const handleSave = () => {
    if (selectedRating) {
      rateMenuItem.mutate({
        weekStart,
        dayOfWeek,
        mealType,
        menuItem,
        rating: selectedRating,
        comment: comment.trim() || null,
      });
      setIsOpen(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 px-2 text-xs gap-1 touch-manipulation",
            currentRating ? "text-amber-600" : "text-gray-400 sm:opacity-0 sm:group-hover:opacity-100"
          )}
        >
          <Star className={cn("h-4 w-4 sm:h-3 sm:w-3", currentRating && "fill-amber-500")} />
          <span className="hidden sm:inline">{currentRating ? currentRating.rating : 'Rate'}</span>
          <span className="sm:hidden">{currentRating ? currentRating.rating : ''}</span>
          {currentRating?.comment && <MessageSquare className="h-3 w-3 ml-0.5" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-72 p-3" align="start" sideOffset={5}>
        <div className="flex flex-col gap-3">
          <p className="text-sm sm:text-xs font-medium text-muted-foreground">Rate this item (1-10)</p>
          <div className="grid grid-cols-5 gap-2 sm:flex sm:gap-1 sm:flex-wrap">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
              <Button
                key={num}
                variant={selectedRating === num ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-10 w-full sm:h-8 sm:w-8 p-0 text-base sm:text-sm touch-manipulation",
                  num <= 3 && "hover:bg-red-100 hover:text-red-700 hover:border-red-300 active:bg-red-100",
                  num >= 4 && num <= 6 && "hover:bg-yellow-100 hover:text-yellow-700 hover:border-yellow-300 active:bg-yellow-100",
                  num >= 7 && "hover:bg-green-100 hover:text-green-700 hover:border-green-300 active:bg-green-100",
                  selectedRating === num && num <= 3 && "bg-red-500 hover:bg-red-600",
                  selectedRating === num && num >= 4 && num <= 6 && "bg-yellow-500 hover:bg-yellow-600",
                  selectedRating === num && num >= 7 && "bg-green-500 hover:bg-green-600"
                )}
                onClick={() => handleRate(num)}
                disabled={rateMenuItem.isPending}
              >
                {num}
              </Button>
            ))}
          </div>

          <div className="space-y-1">
            <Label className="text-sm sm:text-xs text-muted-foreground flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              Comment (optional)
            </Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a note..."
              rows={5}
              className="text-base sm:text-sm resize-none"
            />
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!selectedRating || rateMenuItem.isPending || deleteRating.isPending}
              className="flex-1 h-10 sm:h-8 text-base sm:text-sm touch-manipulation"
            >
              {rateMenuItem.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Save Rating'
              )}
            </Button>
            {currentRating && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  deleteRating.mutate(currentRating.id);
                  setIsOpen(false);
                }}
                disabled={rateMenuItem.isPending || deleteRating.isPending}
                className="h-10 sm:h-8 px-3 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 touch-manipulation"
              >
                {deleteRating.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>

          {currentRating?.comment && (
            <p className="text-xs text-muted-foreground italic border-t pt-2">
              Current note: {currentRating.comment}
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function parseMenuText(text: string): DayMeals[] {
  const meals: DayMeals[] = DAY_NAMES.map(day => ({
    day,
    breakfast: '',
    lunch: '',
    dinner: '',
    snacks: '',
  }));

  // Normalize line endings and split into lines
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  let currentDayIndex = -1;
  let currentMeal: keyof Omit<DayMeals, 'day'> | null = null;
  let mealContent: string[] = [];

  const saveMealContent = () => {
    if (currentDayIndex >= 0 && currentMeal && mealContent.length > 0) {
      // Append to existing content if there's already content for this meal
      const existingContent = meals[currentDayIndex][currentMeal];
      const newContent = mealContent.join('\n').trim();
      meals[currentDayIndex][currentMeal] = existingContent
        ? existingContent + '\n' + newContent
        : newContent;
      mealContent = [];
    }
  };

  // Day name patterns (case insensitive) - matches "TUESDAY December 23" or "Monday:" etc.
  const dayPatterns: Array<{ day: DayOfWeek; patterns: string[] }> = [
    { day: 'Monday', patterns: ['monday', 'lunes', '周一', '星期一'] },
    { day: 'Tuesday', patterns: ['tuesday', 'martes', '周二', '星期二'] },
    { day: 'Wednesday', patterns: ['wednesday', 'miércoles', 'miercoles', '周三', '星期三'] },
    { day: 'Thursday', patterns: ['thursday', 'jueves', '周四', '星期四'] },
    { day: 'Friday', patterns: ['friday', 'viernes', '周五', '星期五'] },
    { day: 'Saturday', patterns: ['saturday', 'sábado', 'sabado', '周六', '星期六'] },
    { day: 'Sunday', patterns: ['sunday', 'domingo', '周日', '星期日'] },
  ];

  // Meal type patterns
  const mealTypes: Array<{ key: keyof Omit<DayMeals, 'day'>; patterns: string[] }> = [
    { key: 'breakfast', patterns: ['breakfast', 'brekkie', 'desayuno', '早餐'] },
    { key: 'lunch', patterns: ['lunch', 'almuerzo', '午餐'] },
    { key: 'dinner', patterns: ['dinner', 'cena', '晚餐'] },
    { key: 'snacks', patterns: ['snack', 'merienda', '零食'] },
  ];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    const lowerLine = trimmedLine.toLowerCase();

    // Skip lines that are just "PREPPED" or similar markers
    if (lowerLine === 'prepped' || lowerLine === 'prep') continue;

    // Check if this line is a day header (e.g., "TUESDAY December 23, 2025" or "Monday:")
    let foundDay = false;
    for (let i = 0; i < dayPatterns.length; i++) {
      const { patterns } = dayPatterns[i];
      if (patterns.some(p => lowerLine.startsWith(p))) {
        // This is a day header - save previous content and switch days
        saveMealContent();
        currentDayIndex = i;
        currentMeal = null;
        foundDay = true;
        break;
      }
    }
    if (foundDay) continue;

    // Check if this line contains a meal type (e.g., "Breakfast: 4 adults" or "PREPPED Breakfast:")
    let foundMealType = false;
    for (const { key, patterns } of mealTypes) {
      // Check if any meal pattern appears in the line
      const mealMatch = patterns.find(p => lowerLine.includes(p));
      if (mealMatch) {
        saveMealContent();
        currentMeal = key;

        // Extract content after the meal type and colon
        const mealIndex = lowerLine.indexOf(mealMatch);
        const afterMeal = trimmedLine.substring(mealIndex + mealMatch.length);
        const colonIndex = afterMeal.indexOf(':');
        if (colonIndex >= 0) {
          const afterColon = afterMeal.substring(colonIndex + 1).trim();
          if (afterColon) {
            mealContent.push(afterColon);
          }
        }
        foundMealType = true;
        break;
      }
    }
    if (foundMealType) continue;

    // If we have a current day and meal, add this line as content
    if (currentDayIndex >= 0 && currentMeal) {
      mealContent.push(trimmedLine);
    }
  }

  // Save any remaining content
  saveMealContent();

  return meals;
}

export default function MenuPage() {
  const t = useTranslations();
  const [selectedWeek, setSelectedWeek] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const weekStartStr = format(selectedWeek, 'yyyy-MM-dd');
  const currentWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const isCurrentWeek = format(selectedWeek, 'yyyy-MM-dd') === format(currentWeekStart, 'yyyy-MM-dd');

  // Ref for scrolling to today
  const todayRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  const { data: menu, isLoading } = useWeeklyMenu(weekStartStr);
  const updateMenu = useUpdateMenu(weekStartStr);
  const { data: canEdit } = useCanEditMenu();
  const { data: ratings } = useMenuRatings(weekStartStr);
  const { isAdmin } = useAuth();

  // Auto-scroll to today when menu loads (only once per page load)
  useEffect(() => {
    if (!isLoading && menu && isCurrentWeek && todayRef.current && !hasScrolledRef.current) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        hasScrolledRef.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading, menu, isCurrentWeek]);

  // Reset scroll flag when week changes
  useEffect(() => {
    hasScrolledRef.current = false;
  }, [weekStartStr]);

  // Helper to find rating for a specific menu item
  const getRating = (dayOfWeek: string, mealType: string, menuItem: string) => {
    return ratings?.find(
      r => r.dayOfWeek === dayOfWeek && r.mealType === mealType && r.menuItem === menuItem
    );
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editedMeals, setEditedMeals] = useState<DayMeals[]>([]);
  const [editedNotes, setEditedNotes] = useState<string>('');
  const [showPasteDialog, setShowPasteDialog] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const [requestFoodName, setRequestFoodName] = useState('');
  const [requestNotes, setRequestNotes] = useState('');
  const createFoodRequest = useCreateFoodRequest();

  const goToPreviousWeek = () => {
    setSelectedWeek(prev => subWeeks(prev, 1));
    setIsEditing(false);
  };

  const goToNextWeek = () => {
    setSelectedWeek(prev => addWeeks(prev, 1));
    setIsEditing(false);
  };

  const goToCurrentWeek = () => {
    setSelectedWeek(currentWeekStart);
    setIsEditing(false);
  };

  const handleStartEdit = () => {
    if (menu) {
      setEditedMeals([...menu.meals]);
      setEditedNotes(menu.notes || '');
      setIsEditing(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedMeals([]);
    setEditedNotes('');
  };

  const handleSave = async () => {
    await updateMenu.mutateAsync({
      meals: editedMeals,
      notes: editedNotes || null,
    });
    setIsEditing(false);
  };

  const updateMeal = (dayIndex: number, mealType: keyof Omit<DayMeals, 'day'>, value: string) => {
    const newMeals = [...editedMeals];
    newMeals[dayIndex] = { ...newMeals[dayIndex], [mealType]: value };
    setEditedMeals(newMeals);
  };

  const handlePaste = () => {
    if (pasteText.trim()) {
      const parsedMeals = parseMenuText(pasteText);
      setEditedMeals(parsedMeals);
      setShowPasteDialog(false);
      setPasteText('');
      setIsEditing(true);
    }
  };

  const handleOpenPasteDialog = () => {
    if (menu) {
      setEditedMeals([...menu.meals]);
      setEditedNotes(menu.notes || '');
    }
    setShowPasteDialog(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const meals = isEditing ? editedMeals : (menu?.meals || []);

  return (
    <div className="space-y-6">
      {/* Header with Week Navigation */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <UtensilsCrossed className="h-6 w-6" />
              {t('menu.title')}
            </h1>
          </div>
          {canEdit && !isEditing && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleOpenPasteDialog}>
                <ClipboardPaste className="h-4 w-4 mr-2" />
                {t('menu.pasteMenu')}
              </Button>
              <Button onClick={handleStartEdit}>
                <Edit2 className="h-4 w-4 mr-2" />
                {t('menu.editMenu')}
              </Button>
            </div>
          )}
          {isEditing && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCancelEdit}>
                <X className="h-4 w-4 mr-2" />
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSave} disabled={updateMenu.isPending}>
                {updateMenu.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {t('common.save')}
              </Button>
            </div>
          )}
        </div>

        {/* Week Navigation */}
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPreviousWeek}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center min-w-[200px]">
            <p className="font-medium">
              {t('menu.weekOf')} {format(selectedWeek, 'MMMM d, yyyy')}
            </p>
            {isCurrentWeek && (
              <Badge variant="secondary" className="mt-1">{t('menu.currentWeek')}</Badge>
            )}
          </div>
          <Button variant="outline" size="icon" onClick={goToNextWeek}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isCurrentWeek && (
            <Button variant="ghost" size="sm" onClick={goToCurrentWeek} className="ml-2">
              {t('common.today')}
            </Button>
          )}
        </div>
      </div>

      {/* Restaurant-Style Menu */}
      <div className="max-w-4xl mx-auto">
        {/* Menu Card with elegant styling */}
        <div className="bg-gradient-to-b from-amber-50 to-orange-50 dark:from-stone-900 dark:to-stone-800 rounded-lg border-2 border-amber-200 dark:border-amber-900 shadow-xl overflow-hidden">
          {/* Decorative top border */}
          <div className="h-2 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600" />

          {/* Menu Header */}
          <div className="text-center py-6 px-4 border-b border-amber-200 dark:border-amber-900">
            <div className="flex items-center justify-center gap-3 mb-2">
              <div className="h-px w-12 bg-amber-400" />
              <UtensilsCrossed className="h-6 w-6 text-amber-600 dark:text-amber-500" />
              <div className="h-px w-12 bg-amber-400" />
            </div>
            <h2 className="text-2xl font-serif font-bold text-amber-900 dark:text-amber-100 tracking-wide">
              {t('menu.weekOf')}
            </h2>
            <p className="text-lg text-amber-700 dark:text-amber-300 font-medium mt-1">
              {format(selectedWeek, 'MMMM d')} - {format(addDays(selectedWeek, 6), 'MMMM d, yyyy')}
            </p>
          </div>

          {/* Chef's Notes */}
          {(menu?.notes || isEditing) && (
            <div className="px-6 py-4 bg-amber-100/50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-900">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-amber-600 dark:text-amber-500 text-sm font-semibold uppercase tracking-widest">
                  Chef&apos;s Notes
                </span>
              </div>
              {isEditing ? (
                <Textarea
                  value={editedNotes}
                  onChange={(e) => setEditedNotes(e.target.value)}
                  placeholder={t('menu.notesPlaceholder')}
                  rows={2}
                  className="bg-white/80 dark:bg-stone-800/80"
                />
              ) : (
                <p className="text-amber-800 dark:text-amber-200 italic whitespace-pre-wrap">{menu?.notes}</p>
              )}
            </div>
          )}

          {/* Daily Menus */}
          <div className="divide-y divide-amber-200 dark:divide-amber-900">
            {meals.map((dayMeal, dayIndex) => {
              const dayDate = addDays(selectedWeek, dayIndex);
              const isTodayDay = isToday(dayDate);
              const hasContent = dayMeal.breakfast || dayMeal.lunch || dayMeal.dinner || dayMeal.snacks;

              return (
                <div
                  key={dayMeal.day}
                  ref={isTodayDay ? todayRef : undefined}
                  className={`px-6 py-5 ${isTodayDay ? 'bg-amber-100 dark:bg-amber-900/30' : ''}`}
                >
                  {/* Day Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-serif font-bold text-amber-900 dark:text-amber-100">
                        {t(`menu.days.${dayMeal.day.toLowerCase()}`)}
                      </h3>
                      <span className="text-amber-600 dark:text-amber-400 text-sm">
                        {format(dayDate, 'MMM d')}
                      </span>
                    </div>
                    {isTodayDay && (
                      <Badge className="bg-amber-600 hover:bg-amber-700 text-white">
                        {t('common.today')}
                      </Badge>
                    )}
                  </div>

                  {/* Meals */}
                  {isEditing ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {DAYS.map(({ key }) => (
                        <div key={key} className="space-y-1">
                          <Label className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                            {t(`menu.meals.${key}`)}
                          </Label>
                          <Textarea
                            value={editedMeals[dayIndex]?.[key] || ''}
                            onChange={(e) => updateMeal(dayIndex, key, e.target.value)}
                            placeholder={t(`menu.placeholder.${key}`)}
                            rows={3}
                            className="text-sm resize-none bg-white/80 dark:bg-stone-800/80"
                          />
                        </div>
                      ))}
                    </div>
                  ) : hasContent ? (
                    <div className="space-y-4">
                      {DAYS.map(({ key }) => {
                        const content = dayMeal[key];
                        if (!content) return null;

                        const lines = content.split('\n').filter(l => l.trim());

                        return (
                          <div key={key}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-bold text-amber-600 dark:text-amber-500 uppercase tracking-widest">
                                {t(`menu.meals.${key}`)}
                              </span>
                              <div className="flex-1 h-px bg-amber-300/50 dark:bg-amber-700/50" />
                            </div>
                            <div className="pl-2 space-y-1">
                              {lines.map((line, i) => {
                                const trimmedLine = line.trim();
                                const isKidsLine = trimmedLine.toLowerCase().includes('zander') ||
                                                   trimmedLine.toLowerCase().includes('zara') ||
                                                   trimmedLine.toLowerCase().includes('kids');

                                return (
                                  <div key={i} className="group flex items-center gap-2">
                                    <p className={cn(
                                      "flex-1 text-amber-900 dark:text-amber-100",
                                      isKidsLine && "text-amber-600 dark:text-amber-400 text-sm italic"
                                    )}>
                                      {line}
                                    </p>
                                    {/* Rating selector and request button for admins - each line item */}
                                    {isAdmin && trimmedLine && !isKidsLine && (
                                      <>
                                        <RatingSelector
                                          menuItem={trimmedLine}
                                          weekStart={weekStartStr}
                                          dayOfWeek={dayMeal.day}
                                          mealType={key}
                                          currentRating={getRating(dayMeal.day, key, trimmedLine)}
                                        />
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 px-2 text-xs gap-1 touch-manipulation sm:opacity-0 sm:group-hover:opacity-100 bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-700 hover:text-amber-800 dark:bg-amber-950/30 dark:hover:bg-amber-950/50 dark:border-amber-700 dark:text-amber-400"
                                          onClick={() => {
                                            setRequestFoodName(trimmedLine);
                                            setShowRequestDialog(true);
                                          }}
                                        >
                                          <Send className="h-4 w-4 sm:h-3 sm:w-3" />
                                          <span className="hidden sm:inline">Request</span>
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-amber-500 dark:text-amber-600 italic text-center py-2">
                      {t('menu.notSet')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Decorative bottom border */}
          <div className="h-2 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600" />
        </div>
      </div>

      {/* Last Updated Info */}
      {menu?.updatedAt && menu.updatedByUser && (
        <p className="text-sm text-muted-foreground text-center">
          {t('menu.lastUpdated')}: {format(new Date(menu.updatedAt), 'MMM d, yyyy h:mm a')} {t('menu.by')} {menu.updatedByUser.fullName}
        </p>
      )}

      {/* Paste Menu Dialog */}
      <Dialog open={showPasteDialog} onOpenChange={setShowPasteDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardPaste className="h-5 w-5" />
              {t('menu.pasteMenu')}
            </DialogTitle>
            <DialogDescription>
              {t('menu.pasteDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={t('menu.pasteExample')}
              rows={15}
              className="font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPasteDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handlePaste} disabled={!pasteText.trim()}>
              {t('menu.applyMenu')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Food Dialog */}
      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Request Food
            </DialogTitle>
            <DialogDescription>
              Request a specific dish from the chef
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="food-name">What would you like?</Label>
              <Input
                id="food-name"
                value={requestFoodName}
                onChange={(e) => setRequestFoodName(e.target.value)}
                placeholder="e.g., Grilled salmon, Chocolate cake..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="request-notes">Notes (optional)</Label>
              <Textarea
                id="request-notes"
                value={requestNotes}
                onChange={(e) => setRequestNotes(e.target.value)}
                placeholder="Any special instructions or preferences..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowRequestDialog(false);
              setRequestFoodName('');
              setRequestNotes('');
            }}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                createFoodRequest.mutate({
                  foodName: requestFoodName,
                  notes: requestNotes || null,
                });
                setShowRequestDialog(false);
                setRequestFoodName('');
                setRequestNotes('');
              }}
              disabled={!requestFoodName.trim() || createFoodRequest.isPending}
            >
              {createFoodRequest.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
