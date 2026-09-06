'use client';

import { useCallback } from 'react';
import { useLocale } from 'next-intl';
import { format, type FormatOptions } from 'date-fns';
import { enUS, es, zhCN } from 'date-fns/locale';

export function useDateLocale() {
  const locale = useLocale();
  return locale === 'es' ? es : locale === 'zh' ? zhCN : enUS;
}

export function useDateFormat() {
  const locale = useDateLocale();
  return useCallback((date: Date | number | string, pattern: string, options?: FormatOptions) => {
    const localizedPattern = pattern.replace(/'at'/g, locale.code === 'es' ? "'a las'" : locale.code === 'zh-CN' ? "'于'" : "'at'");
    return format(date, localizedPattern, { ...options, locale });
  }, [locale]);
}
