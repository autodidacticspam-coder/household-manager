'use client';

import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Star, TrendingUp, TrendingDown, Search, ChefHat, Award, ThumbsUp, ThumbsDown, ShieldX, MessageSquare, User } from 'lucide-react';
import { useMenuRatingsSummary, useAllMenuRatings, useCanAccessFoodRatings } from '@/hooks/use-menu-ratings';
import { cn } from '@/lib/utils';

function RatingBadge({ rating }: { rating: number }) {
  const rounded = Math.round(rating * 10) / 10;
  return (
    <Badge
      className={cn(
        "font-mono text-sm",
        rounded >= 8 && "bg-green-500 hover:bg-green-600",
        rounded >= 6 && rounded < 8 && "bg-yellow-500 hover:bg-yellow-600",
        rounded >= 4 && rounded < 6 && "bg-orange-500 hover:bg-orange-600",
        rounded < 4 && "bg-red-500 hover:bg-red-600"
      )}
    >
      <Star className="h-3 w-3 mr-1 fill-current" />
      {rounded.toFixed(1)}
    </Badge>
  );
}

function getRatingColor(rating: number): string {
  if (rating >= 8) return 'text-green-600';
  if (rating >= 6) return 'text-yellow-600';
  if (rating >= 4) return 'text-orange-600';
  return 'text-red-600';
}

export default function FoodRatingsPage() {
  const t = useTranslations();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDish, setSelectedDish] = useState<string | null>(null);
  const { data: canAccess, isLoading: accessLoading } = useCanAccessFoodRatings();
  const { data: summary, isLoading: summaryLoading } = useMenuRatingsSummary();
  const { data: allRatings, isLoading: ratingsLoading } = useAllMenuRatings();

  // Get all ratings for the selected dish
  const selectedDishRatings = useMemo(() => {
    if (!selectedDish || !allRatings) return [];
    return allRatings.filter(r => r.menuItem === selectedDish);
  }, [selectedDish, allRatings]);

  // Get summary for selected dish
  const selectedDishSummary = useMemo(() => {
    if (!selectedDish || !summary) return null;
    return summary.find(s => s.menuItem === selectedDish);
  }, [selectedDish, summary]);

  const filteredSummary = useMemo(() => {
    if (!summary) return [];
    if (!searchTerm) return summary;
    return summary.filter(item =>
      item.menuItem.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [summary, searchTerm]);

  const filteredRatings = useMemo(() => {
    if (!allRatings) return [];
    if (!searchTerm) return allRatings;
    return allRatings.filter(r =>
      r.menuItem.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allRatings, searchTerm]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!summary || summary.length === 0) return null;

    const topRated = summary.slice(0, 5);
    const bottomRated = [...summary].sort((a, b) => a.averageRating - b.averageRating).slice(0, 5);
    const overallAverage = summary.reduce((sum, item) => sum + item.averageRating, 0) / summary.length;
    const totalRatings = summary.reduce((sum, item) => sum + item.totalRatings, 0);

    return {
      topRated,
      bottomRated,
      overallAverage,
      totalRatings,
      totalItems: summary.length,
    };
  }, [summary]);

  if (accessLoading || summaryLoading || ratingsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Access control - only admins and chefs can view
  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <ShieldX className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
        <p className="text-muted-foreground max-w-md">
          Food ratings are only accessible to Administrators and Chefs.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ChefHat className="h-6 w-6" />
          Food Ratings
        </h1>
        <p className="text-muted-foreground">
          View how your dishes are being rated by the family
        </p>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Overall Average
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={cn("text-3xl font-bold", getRatingColor(stats.overallAverage))}>
                {stats.overallAverage.toFixed(1)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">out of 10</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Ratings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalRatings}</div>
              <p className="text-xs text-muted-foreground mt-1">from all dishes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Dishes Rated
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats.totalItems}</div>
              <p className="text-xs text-muted-foreground mt-1">unique items</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Top Dish
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats.topRated[0] ? (
                <>
                  <div className="text-lg font-semibold truncate">
                    {stats.topRated[0].menuItem}
                  </div>
                  <RatingBadge rating={stats.topRated[0].averageRating} />
                </>
              ) : (
                <p className="text-muted-foreground">No ratings yet</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search dishes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <Tabs defaultValue="summary" className="space-y-4">
        <TabsList>
          <TabsTrigger value="summary" className="gap-2">
            <Award className="h-4 w-4" />
            Summary
          </TabsTrigger>
          <TabsTrigger value="top" className="gap-2">
            <ThumbsUp className="h-4 w-4" />
            Top Rated
          </TabsTrigger>
          <TabsTrigger value="bottom" className="gap-2">
            <ThumbsDown className="h-4 w-4" />
            Needs Improvement
          </TabsTrigger>
          <TabsTrigger value="all" className="gap-2">
            <Star className="h-4 w-4" />
            All Ratings
          </TabsTrigger>
        </TabsList>

        {/* Summary Tab */}
        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle>All Dishes</CardTitle>
              <CardDescription>
                Average ratings for all menu items
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredSummary.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No ratings found. Ratings will appear here once the family rates your dishes.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dish</TableHead>
                      <TableHead className="text-center">Avg Rating</TableHead>
                      <TableHead className="text-center">Total Ratings</TableHead>
                      <TableHead className="text-center">Range</TableHead>
                      <TableHead>Rated By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSummary.map((item, i) => (
                      <TableRow
                        key={i}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedDish(item.menuItem)}
                      >
                        <TableCell className="font-medium max-w-[300px] truncate">
                          <span className="hover:underline">{item.menuItem}</span>
                          {allRatings?.some(r => r.menuItem === item.menuItem && r.comment) && (
                            <MessageSquare className="h-3 w-3 inline ml-2 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <RatingBadge rating={item.averageRating} />
                        </TableCell>
                        <TableCell className="text-center">
                          {item.totalRatings}
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground">
                          {item.minRating} - {item.maxRating}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.raters.join(', ')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top Rated Tab */}
        <TabsContent value="top">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-500" />
                Top Rated Dishes
              </CardTitle>
              <CardDescription>
                Your best performing menu items (rated 7+)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!stats?.topRated.length ? (
                <p className="text-center text-muted-foreground py-8">
                  No top-rated dishes yet
                </p>
              ) : (
                <div className="space-y-4">
                  {stats.topRated
                    .filter(item => item.averageRating >= 7)
                    .map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 cursor-pointer hover:bg-green-100 dark:hover:bg-green-950/40 transition-colors"
                        onClick={() => setSelectedDish(item.menuItem)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-500 text-white font-bold text-sm">
                            {i + 1}
                          </div>
                          <div>
                            <p className="font-medium hover:underline">
                              {item.menuItem}
                              {allRatings?.some(r => r.menuItem === item.menuItem && r.comment) && (
                                <MessageSquare className="h-3 w-3 inline ml-2 text-muted-foreground" />
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {item.totalRatings} rating{item.totalRatings !== 1 ? 's' : ''} from {item.raters.join(', ')}
                            </p>
                          </div>
                        </div>
                        <RatingBadge rating={item.averageRating} />
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Needs Improvement Tab */}
        <TabsContent value="bottom">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-orange-500" />
                Needs Improvement
              </CardTitle>
              <CardDescription>
                Dishes rated below 6 that might benefit from adjustments
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!stats?.bottomRated.filter(item => item.averageRating < 6).length ? (
                <p className="text-center text-muted-foreground py-8">
                  Great job! No dishes need improvement right now.
                </p>
              ) : (
                <div className="space-y-4">
                  {stats.bottomRated
                    .filter(item => item.averageRating < 6)
                    .map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-4 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900 cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-950/40 transition-colors"
                        onClick={() => setSelectedDish(item.menuItem)}
                      >
                        <div>
                          <p className="font-medium hover:underline">
                            {item.menuItem}
                            {allRatings?.some(r => r.menuItem === item.menuItem && r.comment) && (
                              <MessageSquare className="h-3 w-3 inline ml-2 text-muted-foreground" />
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {item.totalRatings} rating{item.totalRatings !== 1 ? 's' : ''} from {item.raters.join(', ')}
                          </p>
                        </div>
                        <RatingBadge rating={item.averageRating} />
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* All Ratings Tab */}
        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>All Individual Ratings</CardTitle>
              <CardDescription>
                Complete history of all ratings
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredRatings.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">
                  No ratings found
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dish</TableHead>
                      <TableHead>Meal</TableHead>
                      <TableHead className="text-center">Rating</TableHead>
                      <TableHead>Rated By</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRatings.map((rating) => (
                      <TableRow key={rating.id}>
                        <TableCell className="font-medium max-w-[250px] truncate">
                          {rating.menuItem}
                        </TableCell>
                        <TableCell className="capitalize text-sm">
                          {rating.dayOfWeek} - {rating.mealType}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            className={cn(
                              "font-mono",
                              rating.rating >= 8 && "bg-green-500",
                              rating.rating >= 6 && rating.rating < 8 && "bg-yellow-500",
                              rating.rating >= 4 && rating.rating < 6 && "bg-orange-500",
                              rating.rating < 4 && "bg-red-500"
                            )}
                          >
                            {rating.rating}/10
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {rating.ratedByUser?.fullName || 'Unknown'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(rating.createdAt), 'MMM d, yyyy')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dish Details Dialog */}
      <Dialog open={!!selectedDish} onOpenChange={(open) => !open && setSelectedDish(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ChefHat className="h-5 w-5" />
              {selectedDish}
            </DialogTitle>
            {selectedDishSummary && (
              <DialogDescription className="flex items-center gap-4 pt-2">
                <RatingBadge rating={selectedDishSummary.averageRating} />
                <span>
                  {selectedDishSummary.totalRatings} rating{selectedDishSummary.totalRatings !== 1 ? 's' : ''}
                </span>
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {selectedDishRatings.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No ratings found for this dish.
              </p>
            ) : (
              selectedDishRatings.map((rating) => (
                <div
                  key={rating.id}
                  className="p-4 rounded-lg border bg-muted/30"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">
                        {rating.ratedByUser?.fullName || 'Unknown'}
                      </span>
                    </div>
                    <Badge
                      className={cn(
                        "font-mono",
                        rating.rating >= 8 && "bg-green-500",
                        rating.rating >= 6 && rating.rating < 8 && "bg-yellow-500",
                        rating.rating >= 4 && rating.rating < 6 && "bg-orange-500",
                        rating.rating < 4 && "bg-red-500"
                      )}
                    >
                      {rating.rating}/10
                    </Badge>
                  </div>

                  <div className="text-xs text-muted-foreground mb-2">
                    {rating.dayOfWeek} {rating.mealType} • {format(new Date(rating.createdAt), 'MMM d, yyyy')}
                  </div>

                  {rating.comment && (
                    <div className="mt-3 p-3 bg-background rounded border">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <MessageSquare className="h-3 w-3" />
                        Comment
                      </div>
                      <p className="text-sm">{rating.comment}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
