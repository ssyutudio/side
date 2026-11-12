// The one tiny step offered on return. Built from the actual latest set-aside
// (never "yesterday" by assumption) and checked against the four conditions:
//   1. no judgment needed  - it only opens a page or a file (or does one fixed thing there), no choice
//   2. cannot fail         - a valid http(s) URL not on the exclusion list, or a file in an app that is
//                            still turned on, with an action the app adapters gave out
//   3. inside a real tool  - not a video/social/break page; a desktop app always is
//   4. result visible      - opening brings the page or the file to the front at once
// However long the user was away, there is one step and no counts. Between a tab and a file, the one
// touched last wins.
import type { SavedFile, SavedTab, SetAside, Step, StepChecks } from '@side/shared';
import { isExcluded, newId as defaultNewId } from '@side/shared';
import type { Clock } from './clock';
import { step as stepCopy } from './copy';
import { BREAKS_KEY, UNSORTED_KEY, cleanTitle, displayGroupName, isBreakUrl, shortName } from './grouping';

/** A record saved but never answered by Chrome for this long was abandoned (the app closed, say). */
const STALE_SAVED_MS = 10 * 60_000;

/**
 * The most recent set-aside that still describes tabs to come back to. Undone and failed ones touched
 * nothing; a saved-only one older than a few minutes never reached Chrome. None of them may hide an
 * earlier Wrap up that really folded tabs (Undo and the next step would aim at the wrong one).
 */
export function latestSetAside(setAsides: readonly SetAside[], now?: number): SetAside | null {
  let best: SetAside | null = null;
  for (const sa of setAsides) {
    if (sa.status === 'undone' || sa.status === 'failed') continue;
    if (sa.status === 'saved' && now !== undefined && now - sa.endedAt > STALE_SAVED_MS) continue;
    if (!best || sa.endedAt > best.endedAt) best = sa;
  }
  return best;
}

function isWebUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Desktop apps for steps: which are turned on, and what the adapters would do with a file. */
export interface AppPicker {
  enabled: readonly string[];
  /** Only where the adapters are at hand (Wrap up); without it a stored app step is still checked. */
  pick?: (f: SavedFile) => { candidateId: string; tool: string; effect: 'runs' | 'opens'; label: string } | null;
}

type Pick = { candidateId: string; tool: string; effect: 'runs' | 'opens'; label: string };

export function checkStep(s: Step, excludedDomains: readonly string[], enabledApps: readonly string[] = []): { ok: boolean; checks: StepChecks } {
  let checks: StepChecks;
  if (s.action.type === 'app') {
    const on = enabledApps.includes(s.action.adapterId) && s.action.candidateId.length > 0;
    checks = { noJudgment: true, cannotFail: on, inRealTool: true, resultVisible: true };
  } else if (s.action.type === 'open_url') {
    checks = {
      noJudgment: true,
      cannotFail: isWebUrl(s.action.url) && !isExcluded(s.action.url, excludedDomains),
      inRealTool: isWebUrl(s.action.url) && !isBreakUrl(s.action.url),
      resultVisible: true,
    };
  } else {
    // Anything else (a command, a made-up type) is never a step.
    checks = { noJudgment: false, cannotFail: false, inRealTool: false, resultVisible: false };
  }
  return { ok: checks.noJudgment && checks.cannotFail && checks.inRealTool && checks.resultVisible, checks };
}

const recency = (t: SavedTab) => t.lastAccessed ?? 0;

function pickTab(sa: SetAside, excludedDomains: readonly string[]): SavedTab | null {
  const usable = (t: SavedTab) => isWebUrl(t.url) && !isBreakUrl(t.url) && !isExcluded(t.url, excludedDomains);
  let pool = sa.tabs.filter((t) => usable(t) && t.groupKey !== BREAKS_KEY && t.groupKey !== UNSORTED_KEY);
  if (!pool.length) pool = sa.tabs.filter((t) => usable(t) && t.groupKey !== BREAKS_KEY);
  if (!pool.length) return null;
  // The work the user touched last, then inside it a tab with a known position if there is one.
  const latest = pool.reduce((a, b) => (recency(b) > recency(a) ? b : a));
  const sameWork = pool.filter((t) => t.groupKey === latest.groupKey);
  const withPos = sameWork.filter((t) => t.position !== null);
  const from = withPos.length ? withPos : sameWork;
  return from.reduce((a, b) => (recency(b) > recency(a) ? b : a));
}

function workNameFor(sa: SetAside, t: SavedTab): string {
  const group = sa.groups.find((g) => g.key === t.groupKey);
  return shortName(group?.name || cleanTitle(t.title) || t.title);
}

/**
 * A step's sentence in the current language. The label stored with the step was written in the
 * language of the day it was made, so the screens rebuild it from the stored facts (work name, the
 * person's line, whether a position is known). If those facts can't be found, the stored label stays.
 */
export function stepLabelFor(step: Step, sa: SetAside | undefined): string {
  if (!sa) return step.label;
  const a = step.action;
  if (a.type === 'app') return stepCopy.appLabel(fileWorkName(a.name), a.tool, sa.userLine);
  if (a.type !== 'open_url') return step.label;
  const tab = sa.tabs.find((x) => x.url === a.url && x.title === a.title) ?? sa.tabs.find((x) => x.url === a.url);
  if (!tab) return step.label;
  const group = sa.groups.find((g) => g.key === tab.groupKey);
  const work = shortName((group ? displayGroupName(group.key, group.name) : '') || cleanTitle(tab.title) || tab.title);
  return stepCopy.label(work, sa.userLine, a.position !== null);
}

/** The newest saved file whose app is still on and can do something with it. */
function pickFile(sa: SetAside, apps: AppPicker | undefined): { file: SavedFile; pick: Pick } | null {
  if (!apps?.pick || !apps.enabled.length) return null;
  const files = (sa.files ?? []).filter((f) => apps.enabled.includes(f.adapterId)).sort((a, b) => b.touchedAt - a.touchedAt);
  for (const file of files) {
    const pick = apps.pick(file);
    if (pick) return { file, pick };
  }
  return null;
}

/** File name without its extension, for sentences. */
export function fileWorkName(name: string): string {
  const base = name.replace(/\.[A-Za-z0-9]{1,8}$/, '');
  return shortName(base || name);
}

/** A step that opens one saved file in its app. */
export function appStep(sa: SetAside, file: SavedFile, pick: Pick, clock: Clock, newId: () => string = defaultNewId): Step {
  return {
    id: newId(),
    fromSetAside: sa.id,
    createdAt: clock.now(),
    label: stepCopy.appLabel(fileWorkName(file.name), pick.tool, sa.userLine),
    action: { type: 'app', workId: file.workId, adapterId: file.adapterId, candidateId: pick.candidateId, tool: pick.tool, effect: pick.effect, label: pick.label, name: file.name },
    checks: { noJudgment: true, cannotFail: true, inRealTool: true, resultVisible: true },
    source: 'rule',
  };
}

export function buildStep(
  sa: SetAside,
  excludedDomains: readonly string[],
  clock: Clock,
  newId: () => string = defaultNewId,
  apps?: AppPicker,
): Step | null {
  const t = pickTab(sa, excludedDomains);
  const f = pickFile(sa, apps);
  if (f && (!t || f.file.touchedAt > recency(t))) return appStep(sa, f.file, f.pick, clock, newId);
  if (!t) return null;
  const draft: Step = {
    id: newId(),
    fromSetAside: sa.id,
    createdAt: clock.now(),
    label: stepCopy.label(workNameFor(sa, t), sa.userLine, t.position !== null),
    action: { type: 'open_url', url: t.url, title: t.title, position: t.position },
    checks: { noJudgment: false, cannotFail: false, inRealTool: false, resultVisible: false },
    source: 'rule',
  };
  const { ok, checks } = checkStep(draft, excludedDomains);
  return ok ? { ...draft, checks } : null;
}

/** The desktop apps turned on in Connections. */
export function enabledApps(settings: { apps?: string[] }): string[] {
  return settings.apps ?? [];
}

/** Exactly one step (or none): the stored step for the latest set-aside, else a new one. */
export function currentStep(
  setAsides: readonly SetAside[],
  steps: readonly Step[],
  excludedDomains: readonly string[],
  clock: Clock,
  newId: () => string = defaultNewId,
  apps?: AppPicker,
): Step | null {
  const sa = latestSetAside(setAsides, clock.now());
  if (!sa) return null;
  const stored = steps.find((s) => s.fromSetAside === sa.id);
  if (stored && checkStep(stored, excludedDomains, apps?.enabled ?? []).ok) return stored;
  return buildStep(sa, excludedDomains, clock, newId, apps);
}
