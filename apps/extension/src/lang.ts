// The screen language the app last sent (`lang.set`). Kept in chrome.storage.local so it survives
// the MV3 worker sleeping; held in memory for the synchronous callers (error text, page marker).
import type { ChromeApi } from './api';
import { KO } from './i18n/ko';

export type Lang = 'en' | 'ko';

export const LANG_KEY = 'side.lang';

let current: Lang = 'en';
let touched = false;

export function language(): Lang {
  return current;
}

/** Sets the language in memory. A choice made before the stored one was read wins over it. */
export function setLanguage(lang: unknown): void {
  touched = true;
  current = lang === 'ko' ? 'ko' : 'en';
}

/** Back to the start-up state (English, nothing chosen yet). For tests. */
export function resetLanguage(): void {
  current = 'en';
  touched = false;
}

/** Reads the stored language (default English) unless a newer `lang.set` has already arrived. */
export async function loadLanguage(api: ChromeApi): Promise<void> {
  try {
    const stored = (await api.storage.local.get(LANG_KEY))[LANG_KEY];
    if (!touched) current = stored === 'ko' ? 'ko' : 'en';
  } catch {
    // Without it the words stay English.
  }
}

export async function saveLanguage(api: ChromeApi, lang: Lang): Promise<void> {
  await api.storage.local.set({ [LANG_KEY]: lang });
}

/** The words for `en` in the current language, with {name} filled from vars. */
export function say(en: string, vars?: Record<string, string | number>): string {
  const text = current === 'ko' ? (KO[en] ?? en) : en;
  return vars ? text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : text;
}
