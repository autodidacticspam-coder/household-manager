'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ALargeSmall } from 'lucide-react';

type TextScale = 'default' | 'lg' | 'xl';

const STORAGE_KEY = 'hm-text-scale';

// Sample-letter size for each option button
const PREVIEW_SIZE: Record<TextScale, string> = {
  default: 'text-base',
  lg: 'text-xl',
  xl: 'text-2xl',
};

function applyScale(scale: TextScale) {
  if (scale === 'default') {
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.removeAttribute('data-text-scale');
  } else {
    localStorage.setItem(STORAGE_KEY, scale);
    document.documentElement.setAttribute('data-text-scale', scale);
  }
}

export function TextSizeCard() {
  const t = useTranslations();
  // Read the stored value after mount so server and client render the same
  // initial markup (reading localStorage during render breaks hydration)
  const [scale, setScale] = useState<TextScale>('default');
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'lg' || stored === 'xl') setScale(stored);
  }, []);

  const options: { value: TextScale; label: string }[] = [
    { value: 'default', label: t('textSize.normal') },
    { value: 'lg', label: t('textSize.large') },
    { value: 'xl', label: t('textSize.extraLarge') },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ALargeSmall className="h-5 w-5" />
          {t('textSize.title')}
        </CardTitle>
        <CardDescription>{t('textSize.hint')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setScale(option.value);
                applyScale(option.value);
              }}
              className={cn(
                'flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-3 transition-colors',
                scale === option.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:bg-muted'
              )}
            >
              <span className={cn('font-semibold leading-none', PREVIEW_SIZE[option.value])}>A</span>
              <span className="text-xs font-medium">{option.label}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
