'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { AvatarUpload } from '@/components/shared/avatar-upload';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Plus, Trash2, Save, Loader2, Calendar, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { getProfile, updateProfile, type UpdateProfileInput } from '../actions';
import { useUser } from '@/hooks/use-user';
import Link from 'next/link';

const importantDateSchema = z.object({
  label: z.string().min(1, 'Label is required').max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
});

const profileFormSchema = z.object({
  fullName: z.string().min(1, 'Name is required').max(255),
  phone: z.string().max(20).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  emergencyContact: z.string().max(255).optional().nullable(),
  importantDates: z.array(importantDateSchema),
});

type ProfileFormData = z.infer<typeof profileFormSchema>;

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
  preferredLocale: string | null;
};

export default function ProfileEditPage() {
  const t = useTranslations();
  const router = useRouter();
  const { updateUser } = useUser();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [currentLocale, setCurrentLocale] = useState<string>('en');

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      fullName: '',
      phone: '',
      avatarUrl: null,
      dateOfBirth: '',
      emergencyContact: '',
      importantDates: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'importantDates',
  });

  const avatarUrl = watch('avatarUrl');

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await getProfile();
        if (data) {
          setProfile(data);
          setValue('fullName', data.fullName);
          setValue('phone', data.phone || '');
          setValue('avatarUrl', data.avatarUrl);
          setValue('dateOfBirth', data.dateOfBirth || '');
          setValue('emergencyContact', data.emergencyContact || '');
          setValue('importantDates', data.importantDates || []);
          setCurrentLocale(data.preferredLocale || 'en');
        }
      } catch (error) {
        console.error('Error loading profile:', error);
        toast.error(t('common.error'));
      } finally {
        setIsLoading(false);
      }
    }

    loadProfile();
  }, [setValue, t]);

  const onSubmit = async (data: ProfileFormData) => {
    setIsSaving(true);
    try {
      const input: UpdateProfileInput = {
        fullName: data.fullName,
        phone: data.phone || null,
        avatarUrl: data.avatarUrl || null,
        dateOfBirth: data.dateOfBirth || null,
        emergencyContact: data.emergencyContact || null,
        importantDates: data.importantDates,
      };

      const result = await updateProfile(input);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(t('profile.profileUpdated'));
      router.push('/profile');
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error(t('common.error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = (url: string) => {
    setValue('avatarUrl', url, { shouldDirty: true });
  };

  const handleAvatarRemove = () => {
    setValue('avatarUrl', null, { shouldDirty: true });
  };

  const addImportantDate = () => {
    append({ label: '', date: format(new Date(), 'yyyy-MM-dd') });
  };

  const handleLocaleChange = async (locale: string) => {
    // Set the locale cookie via API
    await fetch('/api/locale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    });

    // Update user preference in database
    updateUser({ preferredLocale: locale as 'en' | 'es' | 'zh' });

    setCurrentLocale(locale);

    // Reload the page to apply the new locale
    window.location.reload();
  };

  if (isLoading) {
    return (
      <div className="container max-w-2xl py-8">
        <Skeleton className="h-8 w-48 mb-6" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center">
              <Skeleton className="h-32 w-32 rounded-full" />
            </div>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container max-w-2xl py-8">
        <p className="text-muted-foreground">{t('common.error')}</p>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/profile">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{t('profile.editProfile')}</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Avatar Section */}
        <Card>
          <CardHeader>
            <CardTitle>{t('profile.profilePhoto')}</CardTitle>
            <CardDescription>{t('profile.profilePhotoDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <AvatarUpload
              userId={profile.id}
              currentAvatarUrl={avatarUrl || null}
              fullName={profile.fullName}
              onUploadComplete={handleAvatarUpload}
              onRemove={handleAvatarRemove}
              size="lg"
            />
          </CardContent>
        </Card>

        {/* Language Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              {t('settings.language')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>{t('settings.language')}</Label>
              <Select
                value={currentLocale}
                onValueChange={handleLocaleChange}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="zh">中文</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Basic Info Section */}
        <Card>
          <CardHeader>
            <CardTitle>{t('profile.basicInfo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t('profile.email')}</Label>
              <Input
                id="email"
                value={profile.email}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">{t('profile.emailCannotBeChanged')}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fullName">{t('profile.fullName')}</Label>
              <Input
                id="fullName"
                {...register('fullName')}
                placeholder={t('profile.fullNamePlaceholder')}
              />
              {errors.fullName && (
                <p className="text-sm text-destructive">{errors.fullName.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">{t('profile.phone')}</Label>
              <Input
                id="phone"
                type="tel"
                {...register('phone')}
                placeholder={t('profile.phonePlaceholder')}
              />
              {errors.phone && (
                <p className="text-sm text-destructive">{errors.phone.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="dateOfBirth">{t('profile.dateOfBirth')}</Label>
              <Input
                id="dateOfBirth"
                type="date"
                {...register('dateOfBirth')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="emergencyContact">{t('profile.emergencyContact')}</Label>
              <Input
                id="emergencyContact"
                {...register('emergencyContact')}
                placeholder={t('profile.emergencyContactPlaceholder')}
              />
              {errors.emergencyContact && (
                <p className="text-sm text-destructive">{errors.emergencyContact.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Important Dates Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t('profile.importantDates')}</CardTitle>
                <CardDescription>{t('profile.importantDatesDescription')}</CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addImportantDate}
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('profile.addDate')}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {fields.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('profile.noImportantDates')}</p>
                <Button
                  type="button"
                  variant="link"
                  onClick={addImportantDate}
                  className="mt-2"
                >
                  {t('profile.addFirstDate')}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex gap-3 items-start">
                    <div className="flex-1 space-y-2">
                      <Label>{t('profile.dateLabel')}</Label>
                      <Input
                        {...register(`importantDates.${index}.label`)}
                        placeholder={t('profile.dateLabelPlaceholder')}
                      />
                      {errors.importantDates?.[index]?.label && (
                        <p className="text-sm text-destructive">
                          {errors.importantDates[index]?.label?.message}
                        </p>
                      )}
                    </div>
                    <div className="w-40 space-y-2">
                      <Label>{t('profile.date')}</Label>
                      <Input
                        type="date"
                        {...register(`importantDates.${index}.date`)}
                      />
                      {errors.importantDates?.[index]?.date && (
                        <p className="text-sm text-destructive">
                          {errors.importantDates[index]?.date?.message}
                        </p>
                      )}
                    </div>
                    <div className="pt-8">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex justify-end gap-4">
          <Link href="/profile">
            <Button type="button" variant="outline">
              {t('common.cancel')}
            </Button>
          </Link>
          <Button type="submit" disabled={isSaving || !isDirty}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('common.saving')}
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {t('common.saveChanges')}
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
