import { useSyncExternalStore } from 'react';
import { getLocale, subscribeLocale } from '../i18n';
import { DIAGNOSTIC_LOCALES, type Locale } from './locales';
export function diagnosticText(locale: string, key: string, params?: Record<string, string | number>): string {
 const cat = DIAGNOSTIC_LOCALES[locale as Locale] ?? DIAGNOSTIC_LOCALES.en;
 const value = cat[key] ?? DIAGNOSTIC_LOCALES.en[key] ?? key;
 return params ? value.replace(/\{(\w+)\}/g, (match, name: string) => name in params ? String(params[name]) : match) : value;
}
export function useDiagnosticText() {
 const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
 return { locale, t: (key: string, params?: Record<string, string | number>) => diagnosticText(locale, key, params) };
}
