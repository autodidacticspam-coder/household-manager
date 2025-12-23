'use client';

import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Camera, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

interface AvatarUploadProps {
  userId: string;
  currentAvatarUrl: string | null;
  fullName: string;
  onUploadComplete: (url: string) => void;
  onRemove?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-16 w-16',
  md: 'h-24 w-24',
  lg: 'h-32 w-32',
};

export function AvatarUpload({
  userId,
  currentAvatarUrl,
  fullName,
  onUploadComplete,
  onRemove,
  size = 'lg',
}: AvatarUploadProps) {
  const t = useTranslations();
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentAvatarUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error(t('profile.invalidFileType'));
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('profile.fileTooLarge'));
      return;
    }

    setIsUploading(true);

    try {
      // Create a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      setPreviewUrl(publicUrl);
      onUploadComplete(publicUrl);
      toast.success(t('profile.avatarUpdated'));
    } catch (error) {
      console.error('Avatar upload error:', error);
      toast.error(t('profile.avatarUploadFailed'));
    } finally {
      setIsUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = async () => {
    if (!previewUrl || !onRemove) return;

    try {
      // Extract path from URL if it's a Supabase storage URL
      const url = new URL(previewUrl);
      if (url.pathname.includes('/avatars/')) {
        const path = url.pathname.split('/avatars/')[1];
        if (path) {
          await supabase.storage.from('avatars').remove([path]);
        }
      }

      setPreviewUrl(null);
      onRemove();
      toast.success(t('profile.avatarRemoved'));
    } catch (error) {
      console.error('Avatar remove error:', error);
      toast.error(t('profile.avatarRemoveFailed'));
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <Avatar className={sizeClasses[size]}>
          <AvatarImage src={previewUrl || undefined} alt={fullName} />
          <AvatarFallback className="text-2xl">{getInitials(fullName)}</AvatarFallback>
        </Avatar>

        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={isUploading}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          <Camera className="h-4 w-4 mr-2" />
          {previewUrl ? t('profile.changePhoto') : t('profile.uploadPhoto')}
        </Button>

        {previewUrl && onRemove && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRemove}
            disabled={isUploading}
          >
            <X className="h-4 w-4 mr-2" />
            {t('profile.removePhoto')}
          </Button>
        )}
      </div>
    </div>
  );
}
