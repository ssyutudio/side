// The desktop app connector: files someone worked on in the apps they turned on, and one fixed
// action to open them again. Wraps the adapters brought over from side-service (./apps).
// Nothing is looked at unless at least one app is turned on, and only those apps are looked at.
// Paths stay on this computer: they are kept in the local data file and never leave this module
// except to the adapters, which pass them to `open` / `osascript` as separate arguments.
import type { SavedFile } from '@side/shared';
import { appCandidates, performAppAction, recentWork, type AppActionResult } from './apps/index.mjs';
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
      return first ? { candidateId: first.id, tool: first.tool, effect: first.effect, label: first.label } : null;
    } catch {
      return null;
    }
  },

  async run(file, candidateId) {
    try {
      return await performAppAction(register(file), candidateId);
    } catch {
      return { ok: false, did: null, tool: file.tool, error: 'open_failed', message: `Couldn't open it in ${file.tool}.` };
    }
  },
};
