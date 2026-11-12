// The desktop app connector: files someone worked on in the apps they turned on, and one fixed
// action to open them again. Wraps the adapters brought over from side-service (./apps).
// Nothing is looked at unless at least one app is turned on, and only those apps are looked at.
// Paths stay on this computer: they are kept in the local data file and never leave this module
// except to the adapters, which pass them to `open` / `osascript` as separate arguments.
import type { SavedFile } from '@side/shared';
import { appCandidates, performAppAction, recentWork, type AppActionResult } from './apps/index.mjs';
import { k, language, t } from '../../i18n';
import { makeWork, privateFacts } from './apps/lib/work.mjs';

/** The step the adapters would take for a file: smallest first. */
export interface AppPick {
  candidateId: string;
  tool: string;
  effect: 'runs' | 'opens';
  label: string;
}

export interface AppsPort {
  /** Files touched at or after `sinceMs` in the turned-on apps, newest first. Empty list: looks at nothing. */
  filesSince(enabled: readonly string[], sinceMs: number): Promise<SavedFile[]>;
  /** The one action Side would offer for this saved file, or null when the app can't do anything with it. */
  pick(file: SavedFile): AppPick | null;
  /** Runs one candidate for the file. Only an id `pick` gave out can do anything. */
  run(file: SavedFile, candidateId: string): Promise<AppActionResult>;
}

/** The sentences the adapters write (apps/lib/words.mjs), by their code, so they follow the screen language. */
const APP_WORDS: Record<string, string> = {
  app_not_installed: k("Couldn't find {tool} on this computer."),
  file_moved: k("Couldn't find that file. It may have been moved or renamed."),
  open_failed: k("Couldn't open it in {tool}."),
  stale_candidate: k("That action isn't available any more."),
  automation_denied: k(
    "Opened it, but no further. To allow the rest, turn on {tool} under the app running Side, in System Settings > Privacy & Security > Automation.",
  ),
  automation_pending: k("Opened it, but no further. {tool} isn't answering. Check for a window waiting on you."),
  action_incomplete: k('Opened it, but no further.'),
  already_running: k("{tool} was already running, so I only brought it to the front. I didn't open the file, so nothing unsaved is touched."),
};

/** The result with its message in the screen language (English stays exactly what the adapters said). */
function inScreenLanguage(r: AppActionResult, tool: string): AppActionResult {
  const en = r.error ? APP_WORDS[r.error] : undefined;
  return en && r.message ? { ...r, message: t(en, { tool: r.tool || tool }) } : r;
}

const LABELS = [
  k('Open {name} in {tool}'),
  k('Open {tool}'),
  k('Open {tool}. Look for {name}'),
  k('Go to the last filled cell of {name} in {tool}'),
  k('Go to the end of {name} in {tool}'),
  k('Go to the last slide of {name} in {tool}'),
  k('Play the last slide of {name} as a slide show'),
  k('Open a one-line SELECT 1 in {tool}'),
  k('Play the last ten seconds of {look} in {tool}'),
  k('Hear the last ten seconds of {look} in {tool}'),
  k('Hear the first ten seconds of {look}'),
  k('Look at {look} in {tool}'),
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * An action label the adapters wrote in English ("Open Report in Excel"), in the screen language.
 * Matched back to its template so the file name stays as it was; a label that fits none stays as is.
 */
export function localizeAppLabel(label: string, tool: string): string {
  if (language() === 'en') return label;
  for (const en of LABELS) {
    const names: string[] = [];
    const pattern = en
      .split(/(\{\w+\})/)
      .map((part) => {
        if (part === '{tool}') return escapeRe(tool);
        if (part === '{name}' || part === '{look}') {
          names.push(part.slice(1, -1));
          return '(.+?)';
        }
        return escapeRe(part);
      })
      .join('');
    const m = new RegExp(`^${pattern}$`).exec(label);
    if (m) return t(en, { tool, ...Object.fromEntries(names.map((n, i) => [n, m[i + 1]])) });
  }
  return label;
}

const MAX_FILES = 12;

/** Registers the saved file with the adapters again (same ids as when it was found). */
function register(f: SavedFile) {
  return makeWork({ adapterId: f.adapterId, path: f.path, key: f.key, name: f.name, touchedMs: f.touchedAt, lookback: f.lookback ?? null });
}

export const desktopApps: AppsPort = {
  async filesSince(enabled, sinceMs) {
    if (!enabled.length) return [];
    const work = await recentWork({ limit: 40, only: enabled });
    const out: SavedFile[] = [];
    for (const w of work) {
      const at = w.touched_at ? Date.parse(w.touched_at) : NaN;
      if (!Number.isFinite(at) || at < sinceMs) continue;
      const facts = privateFacts(w);
      if (!facts || !enabled.includes(facts.adapterId)) continue;
      out.push({ workId: w.id, adapterId: facts.adapterId, path: facts.path, key: facts.key, name: w.name, app: w.app, tool: w.tool, touchedAt: at, lookback: facts.lookback });
      if (out.length >= MAX_FILES) break;
    }
    return out;
  },

  pick(file) {
    try {
      const [first] = appCandidates(register(file));
      return first ? { candidateId: first.id, tool: first.tool, effect: first.effect, label: localizeAppLabel(first.label, first.tool) } : null;
    } catch {
      return null;
    }
  },

  async run(file, candidateId) {
    try {
      return inScreenLanguage(await performAppAction(register(file), candidateId), file.tool);
    } catch {
      return { ok: false, did: null, tool: file.tool, error: 'open_failed', message: t("Couldn't open it in {tool}.", { tool: file.tool }) };
    }
  },
};
