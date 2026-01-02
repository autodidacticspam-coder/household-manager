import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { defaultLocale, type Locale, locales } from './i18n.config';

export default getRequestConfig(async () => {
  let locale: Locale = defaultLocale;

  try {
    const cookieStore = await cookies();
    const localeCookie = cookieStore.get('locale')?.value as Locale;

    if (localeCookie && locales.includes(localeCookie)) {
      locale = localeCookie;
    }
  } catch (error) {
    // Cookies may not be available during certain server operations
    console.warn('Failed to read locale cookie, using default:', error);
  }

  try {
    const messages = (await import(`./messages/${locale}.json`)).default;
    return {
      locale,
      messages,
    };
  } catch (error) {
    // Fallback to English if locale messages fail to load
    console.error('Failed to load messages for locale:', locale, error);
    const fallbackMessages = (await import('./messages/en.json')).default;
    return {
      locale: 'en',
      messages: fallbackMessages,
    };
  }
});
