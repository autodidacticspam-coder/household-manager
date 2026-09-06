import en from '@/messages/en.json';

export function flattenMessages(input: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(input).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [[path, value]] : Object.entries(flattenMessages(value as Record<string, unknown>, path));
  }));
}

const english = flattenMessages(en);
const keysByText = new Map(Object.entries(english).filter(([,text]) => !text.includes('{')).map(([key,text]) => [text,key]));
const dynamic = Object.entries(english).filter(([key, value]) => key.startsWith('feedback.') && value.includes('{value')).map(([key, text]) => {
  const names: string[] = [];
  const parts = text.split(/(\{value\d+\})/).map(part => {
    if (/^\{value\d+\}$/.test(part)) { names.push(part.slice(1,-1)); return '(.+?)'; }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return { key, names, pattern: new RegExp('^' + parts.join('') + '$', 's') };
});

export function translateSystemMessage(message: unknown, translate: (key: string, values?: Record<string, string>) => string, currentMessages: Set<string>): string {
  const text = message instanceof Error ? message.message : String(message ?? '');
  if (currentMessages.has(text)) return text;
  if (english[text]) return translate(text);
  const key = keysByText.get(text);
  if (key) return translate(key);
  for (const rule of dynamic) {
    const match = text.match(rule.pattern);
    if (match) return translate(rule.key, Object.fromEntries(rule.names.map((name,i) => [name,match[i+1]])));
  }
  return translate('feedback.unexpected');
}
