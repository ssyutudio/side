// Screen language. English text is the key: t('Set today aside') is that text in English and its
// Korean when Korean is picked in Settings (a missing translation falls back to the English).
// Each process (main, and every window) sets its language from the settings before it draws.
//
// Rules for code that shows words:
// - Call t()/tn() when the words are drawn, never at module load (the language may change later).
// - A key is one literal string; {name} marks a value. No `${}` inside a key.
// - Words kept in a constant table are marked with k('...') and passed to t() when drawn.
// - Data (tab titles, group names, file names, the user's own line) is never passed to t().
import type { Language } from '@side/shared';
import { KO } from './ko';

let current: Language = 'en';

export function setLanguage(lang: Language | null | undefined): void {
  current = lang === 'ko' ? 'ko' : 'en';
}

export function language(): Language {
  return current;
}

export type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** The words for `en` in the current language, with {name} filled from vars. */
export function t(en: string, vars?: Vars): string {
  return fill(current === 'ko' ? (KO[en] ?? en) : en, vars);
}

/** A count: English picks `one` or `many` by n ({n} is filled in); Korean has one form for both. */
export function tn(n: number, one: string, many: string, vars?: Vars): string {
  return t(n === 1 ? one : many, { n, ...vars });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * True when `text` is the sentence `en` (with any values) in English or in its Korean. For words
 * stored earlier, which may be in either language whatever the screen says now.
 */
export function says(text: string, en: string): boolean {
  return [en, KO[en]].some((tpl) => tpl !== undefined && new RegExp(`^${tpl.split(/\{\w+\}/).map(escape).join('[\\s\\S]+')}$`).test(text));
}

/** Marks a literal for translation without translating it yet (for constant tables). */
export function k<T extends string>(en: T): T {
  return en;
}
