// StepEvent lifecycle: shown -> clicked -> opened, or dismissed (Not now / Rest today),
// and whether the user was still in that work ten minutes after clicking.
// "Shown" is recorded only after the renderer confirms the bubble was drawn while
// sidy was visible and the Mac awake, so a hidden or sleeping bubble never counts.
import type { DismissKind, SetAside, Step, StepEvent } from '@side/shared';
import { STILL_WORKING_AFTER_MS, hostOf } from '@side/shared';
import { BREAKS_KEY, isBreakUrl } from './grouping';

function blank(stepId: string): StepEvent {
  return { stepId, shownAt: null, clickedAt: null, openedAt: null, stillWorkingAt10m: null, dismissed: null };
}

function update(events: readonly StepEvent[], stepId: string, fn: (e: StepEvent) => StepEvent): StepEvent[] {
  const i = events.findIndex((e) => e.stepId === stepId);
  if (i < 0) return [...events, fn(blank(stepId))];
  const next = [...events];
  next[i] = fn(events[i]);
  return next;
}

export function markShown(
  events: readonly StepEvent[],
  stepId: string,
  drawnAt: number,
  state: { hidden: boolean; asleep: boolean },
): StepEvent[] {
  if (state.hidden || state.asleep) return [...events];
  return update(events, stepId, (e) => (e.shownAt === null ? { ...e, shownAt: drawnAt } : e));
}

export function markClicked(events: readonly StepEvent[], stepId: string, at: number): StepEvent[] {
  return update(events, stepId, (e) => (e.clickedAt === null ? { ...e, clickedAt: at } : e));
}

/** The extension confirmed the page is open and positioned. */
export function markOpened(events: readonly StepEvent[], stepId: string, at: number): StepEvent[] {
  return update(events, stepId, (e) => (e.openedAt === null ? { ...e, openedAt: at } : e));
}

export function markDismissed(events: readonly StepEvent[], stepId: string, kind: DismissKind): StepEvent[] {
  return update(events, stepId, (e) => ({ ...e, dismissed: kind }));
}

/** Seconds from the click to the confirmed open, or null if not both known. */
export function secondsToWork(e: StepEvent): number | null {
  if (e.clickedAt === null || e.openedAt === null) return null;
  return Math.max(0, (e.openedAt - e.clickedAt) / 1000);
}

function stripHash(url: string): string {
  const i = url.indexOf('#');
  return i < 0 ? url : url.slice(0, i);
}

/**
 * Ten minutes after the click, is the active tab still in that work?
 * activeUrl: a URL, null (no active tab), or undefined (Chrome not connected: unknown).
 * Returns null while not due, not clicked, or unknown.
 */
export function judgeStillWorking(
  e: StepEvent,
  step: Step,
  sa: SetAside | null,
  activeUrl: string | null | undefined,
  now: number,
): boolean | null {
  if (e.clickedAt === null) return null;
  if (now < e.clickedAt + STILL_WORKING_AFTER_MS) return null;
  if (activeUrl === undefined) return null;
  if (activeUrl === null || isBreakUrl(activeUrl)) return false;
  const host = hostOf(activeUrl);
  if (host && host === hostOf(step.action.url)) return true;
  const workUrls = new Set((sa?.tabs ?? []).filter((t) => t.groupKey !== BREAKS_KEY).map((t) => stripHash(t.url)));
  return workUrls.has(stripHash(activeUrl));
}

/** Fills in every due, still unjudged event. Judged events never change again. */
export function applyStillWorking(
  events: readonly StepEvent[],
  steps: readonly Step[],
  setAsides: readonly SetAside[],
  activeUrl: string | null | undefined,
  now: number,
): StepEvent[] {
  return events.map((e) => {
    if (e.stillWorkingAt10m !== null) return e;
    const step = steps.find((s) => s.id === e.stepId);
    if (!step) return e;
    const sa = setAsides.find((x) => x.id === step.fromSetAside) ?? null;
    const verdict = judgeStillWorking(e, step, sa, activeUrl, now);
    return verdict === null ? e : { ...e, stillWorkingAt10m: verdict };
  });
}
