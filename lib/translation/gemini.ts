import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export type SupportedLocale = 'en' | 'es' | 'zh';

export type TranslatedContent = {
  en: string;
  es: string;
  zh: string;
};

const localeNames: Record<SupportedLocale, string> = {
  en: 'English',
  es: 'Spanish',
  zh: 'Chinese (Simplified)',
};

/**
 * Translates text to all supported languages using Gemini API
 */
export async function translateToAllLanguages(
  text: string,
  sourceLocale: SupportedLocale = 'en'
): Promise<TranslatedContent> {
  if (!text || text.trim() === '') {
    return { en: '', es: '', zh: '' };
  }

  if (!process.env.GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY not set, skipping translation');
    return { en: text, es: text, zh: text };
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const targetLocales = (['en', 'es', 'zh'] as SupportedLocale[]).filter(
      (locale) => locale !== sourceLocale
    );

    const prompt = `Translate the following text from ${localeNames[sourceLocale]} to ${targetLocales.map((l) => localeNames[l]).join(' and ')}.

Text to translate:
"${text}"

Respond ONLY with a JSON object in this exact format (no markdown, no code blocks):
{
  "${targetLocales[0]}": "translation here",
  "${targetLocales[1]}": "translation here"
}`;

    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();

    // Clean up response - remove any markdown code blocks if present
    let cleanResponse = response;
    if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    const translations = JSON.parse(cleanResponse);

    return {
      en: sourceLocale === 'en' ? text : translations.en || text,
      es: sourceLocale === 'es' ? text : translations.es || text,
      zh: sourceLocale === 'zh' ? text : translations.zh || text,
    };
  } catch (error) {
    console.error('Translation error:', error);
    // Return original text for all languages on error
    return { en: text, es: text, zh: text };
  }
}

/**
 * Translates task title and description to all languages
 */
export async function translateTaskContent(
  title: string,
  description: string | null,
  sourceLocale: SupportedLocale = 'en'
): Promise<{
  title: TranslatedContent;
  description: TranslatedContent;
}> {
  const [titleTranslations, descriptionTranslations] = await Promise.all([
    translateToAllLanguages(title, sourceLocale),
    description ? translateToAllLanguages(description, sourceLocale) : Promise.resolve({ en: '', es: '', zh: '' }),
  ]);

  return {
    title: titleTranslations,
    description: descriptionTranslations,
  };
}
