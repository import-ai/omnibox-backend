import { readFileSync } from 'fs';
import { join } from 'path';

const locales = {
  en: JSON.parse(
    readFileSync(join(__dirname, '../i18n/en/resource.json'), 'utf8'),
  ),
  zh: JSON.parse(
    readFileSync(join(__dirname, '../i18n/zh/resource.json'), 'utf8'),
  ),
} as const;

function lookup(lang: 'en' | 'zh', key: string): string | undefined {
  const path = key.replace(/^resource\./, '').split('.');
  let value: unknown = locales[lang];
  for (const part of path) {
    if (!value || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === 'string' ? value : undefined;
}

function interpolate(
  template: string,
  args: Record<string, unknown> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const value = args[name];
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
    return `{${name}}`;
  });
}

export function testI18n(defaultLang: 'en' | 'zh' = 'en') {
  return {
    t: (
      key: string,
      opts?: { args?: Record<string, unknown>; lang?: string },
    ) => {
      const lang =
        opts?.lang === 'zh' || opts?.lang === 'en' ? opts.lang : defaultLang;
      const template = lookup(lang, key) ?? lookup('en', key) ?? key;
      return interpolate(template, opts?.args);
    },
  };
}
