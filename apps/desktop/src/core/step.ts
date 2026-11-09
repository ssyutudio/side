// The one tiny step offered on return. Built from the actual latest set-aside
// (never "yesterday" by assumption) and checked against the four conditions:
//   1. no judgment needed  - it only opens a page, no command, no choice
//   2. cannot fail         - a valid http(s) URL that is not on the exclusion list
//   3. inside a real tool  - not a video/social/break page
//   4. result visible      - opening brings the page to the front at once
// However long the user was away, there is one step and no counts.
import type { SavedTab, SetAside, Step, StepChecks } from '@side/shared';
import { isExcluded, newId as defaultNewId } from '@side/shared';
import type { Clock } from './clock';
import { step as stepCopy } from './copy';
import { BREAKS_KEY, UNSORTED_KEY, cleanTitle, isBreakUrl, shortName } from './grouping';

/** The most recent set-aside that still describes tabs to come back to. */
export function latestSetAside(setAsides: readonly SetAside[]): SetAside | null {
  let best: SetAside | null = null;
  for (const sa of setAsides) {
    if (sa.status === 'undone') continue;
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

export function checkStep(s: Step, excludedDomains: readonly string[]): { ok: boolean; checks: StepChecks } {
  const isOpen = s.action.type === 'open_url';
  const checks: StepChecks = {
    noJudgment: isOpen,
    cannotFail: isWebUrl(s.action.url) && !isExcluded(s.action.url, excludedDomains),
    inRealTool: isWebUrl(s.action.url) && !isBreakUrl(s.action.url),
    resultVisible: isOpen,
  };
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

export function buildStep(
  sa: SetAside,
  excludedDomains: readonly string[],
  clock: Clock,
  newId: () => string = defaultNewId,
): Step | null {
  const t = pickTab(sa, excludedDomains);
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

/** Exactly one step (or none): the stored step for the latest set-aside, else a new one. */
export function currentStep(
  setAsides: readonly SetAside[],
  steps: readonly Step[],
  excludedDomains: readonly string[],
  clock: Clock,
  newId: () => string = defaultNewId,
): Step | null {
  const sa = latestSetAside(setAsides);
  if (!sa) return null;
  const stored = steps.find((s) => s.fromSetAside === sa.id);
  if (stored && checkStep(stored, excludedDomains).ok) return stored;
  return buildStep(sa, excludedDomains, clock, newId);
}
