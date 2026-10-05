import en from '../locales/en.json';
import de from '../locales/de.json';
/**
 * Small in-house i18n layer (no dependency, no network).
 * Keys are flat strings. Plurals use `_one` / `_other` suffixes picked with Intl.PluralRules.
 * Placeholders look like {name}. Missing keys fall back to English, then to the key itself.
 */
export type Catalogue = Record<string, string>;
export const BASE_LOCALE = 'en';
/** Languages with a catalogue. Add a file in src/locales and an entry here. */
export const CATALOGUES: Record<string, Catalogue> = {en, de};
/** Native names for the language picker. */
export const LOCALE_NAMES: Record<string, string> = {en:'English', de:'Deutsch'};
export const LOCALE_KEY = 'somnia.locale.v1';
export const SYSTEM = 'system';

let current = BASE_LOCALE;
const listeners = new Set<() => void>();

export function resolveLocale(pref: string, systemLangs: readonly string[]): string {
 const candidates = pref === SYSTEM ? systemLangs : [pref];
 for (const raw of candidates) {
  const tag = raw.replace('_', '-');
  if (CATALOGUES[tag]) return tag;
  const lang = tag.split('-')[0].toLowerCase();
  const hit = Object.keys(CATALOGUES).find(k => k.toLowerCase() === tag.toLowerCase()) ?? Object.keys(CATALOGUES).find(k => k.split('-')[0].toLowerCase() === lang);
  if (hit) return hit;
 }
 return BASE_LOCALE;
}
export function readLocalePref(): string {
 try { return localStorage.getItem(LOCALE_KEY) || SYSTEM; } catch { return SYSTEM; }
}
export function initLocale(): void {
 const sys = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
 setLocale(resolveLocale(readLocalePref(), sys));
}
export function setLocalePref(pref: string): void {
 try { localStorage.setItem(LOCALE_KEY, pref); } catch { /* storage unavailable */ }
 initLocale();
}
export function setLocale(l: string): void {
 current = CATALOGUES[l] ? l : BASE_LOCALE;
 if (typeof document !== 'undefined') document.documentElement.lang = current;
 listeners.forEach(f => f());
}
export const getLocale = () => current;
export const subscribeLocale = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

export type Params = Record<string, string | number>;
export function translate(locale: string, key: string, params?: Params): string {
 let msg: string | undefined;
 const cat = CATALOGUES[locale] ?? CATALOGUES[BASE_LOCALE];
 if (params && typeof params.count === 'number') {
  const form = new Intl.PluralRules(locale).select(params.count);
  msg = cat[`${key}_${form}`] ?? CATALOGUES[BASE_LOCALE][`${key}_${form}`] ?? cat[`${key}_other`] ?? CATALOGUES[BASE_LOCALE][`${key}_other`];
 }
 msg ??= cat[key] ?? CATALOGUES[BASE_LOCALE][key] ?? key;
 return params ? msg.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : msg;
}
export const t = (key: string, params?: Params) => translate(current, key, params);
/** Translated text if the key exists in any catalogue, otherwise the given English fallback (used for commands registered with literal titles). */
export const tOr = (key: string, fallback: string) => (key in CATALOGUES[current] || key in CATALOGUES[BASE_LOCALE]) ? translate(current, key) : fallback;
