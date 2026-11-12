// Korean for every English key passed to t(), tn() and k(). One file per part of the app, so the
// parts can be translated side by side; keys shared by two parts must say the same thing.
// Terms and tone: GLOSSARY.md next to this file.
import { CORE } from './core';
import { EDGE } from './edge';
import { MAIN } from './main';
import { MINI } from './mini';
import { ONBOARDING } from './onboarding';

export const KO_PARTS: Record<string, Record<string, string>> = { core: CORE, edge: EDGE, main: MAIN, mini: MINI, onboarding: ONBOARDING };

export const KO: Record<string, string> = Object.assign({}, CORE, EDGE, MAIN, MINI, ONBOARDING);

/** The language's own name, shown in Settings whatever the current language is. */
export const KOREAN_NAME = '한국어';
