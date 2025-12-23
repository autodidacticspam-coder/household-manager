'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Pencil, Calendar, Phone, UserCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { getProfile } from './actions';

type ProfileData = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  avatarUrl: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  emergencyContact: string | null;
  importantDates: { label: string; date: string }[];
};

export default function ProfilePage() {
  const t = useTranslations();
  const { user, isLoading: authLoading } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      if (!user) return;
      try {
        const data = await getProfile();
        setProfile(data);
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        setIsLoading(false);
      }
    }

    if (!authLoading) {
      loadProfile();
    }
  }, [user, authLoading]);

  if (authLoading || isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-4">
              <Skeleton className="h-20 w-20 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user || !profile) return null;

  const initials = profile.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('nav.profile')}</h1>
          <p className="text-muted-foreground">
            {t('profile.viewAndManage')}
          </p>
        </div>
        <Link href="/profile/edit">
          <Button>
            <Pencil className="h-4 w-4 mr-2" />
            {t('profile.editProfile')}
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('employees.profile')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-6">
            <Avatar className="h-24 w-24">
              <AvatarImage src={profile.avatarUrl || undefined} alt={profile.fullName} />
              <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-4">
              <div>
                <h2 className="text-xl font-semibold">{profile.fullName}</h2>
                <p className="text-muted-foreground">{profile.email}</p>
                <Badge variant="secondary" className="mt-2">
                  {profile.role === 'admin' ? t('employees.roles.admin') : t('employees.roles.employee')}
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                {profile.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{profile.phone}</span>
                  </div>
                )}
                {profile.dateOfBirth && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>{t('profile.dateOfBirth')}: {format(new Date(profile.dateOfBirth), 'MMMM d, yyyy')}</span>
                  </div>
                )}
                {profile.emergencyContact && (
                  <div className="flex items-center gap-2 text-sm">
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    <span>{t('profile.emergencyContact')}: {profile.emergencyContact}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('employees.importantDates')}</CardTitle>
            {profile.importantDates.length > 0 && (
              <Link href="/profile/edit">
                <Button variant="ghost" size="sm">
                  <Pencil className="h-4 w-4 mr-2" />
                  {t('common.edit')}
                </Button>
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {profile.importantDates.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground mb-4">
                {t('profile.noImportantDates')}
              </p>
              <Link href="/profile/edit">
                <Button variant="outline" size="sm">
                  {t('profile.addFirstDate')}
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {profile.importantDates.map((date, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{date.label}</span>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(date.date), 'MMMM d, yyyy')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
