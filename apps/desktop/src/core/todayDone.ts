// "What you did today" from the user's own words and confirmed events only.
// A page being open is not something done. A set-aside counts only once the
// extension confirmed it; a step counts once it was clicked, and again if the
// user was still in that work ten minutes later.
import type { SetAside, Step, StepEvent } from '@side/shared';
import { STILL_WORKING_AFTER_MS } from '@side/shared';
import type { Clock } from './clock';
import { done } from './copy';
import { cleanTitle, shortName } from './grouping';
import { fileWorkName } from './step';

/** A work day starts at 4 a.m., so late-night work belongs to the evening before. */
export const WORK_DAY_START_HOURS = 4;

/** Start (local midnight) of the calendar day this moment's work day is named after. */
export function workDayOf(ms: number): number {
  const d = new Date(ms);
  if (d.getHours() < WORK_DAY_START_HOURS) d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 4 a.m. local time that begins the work day `daysAhead` after the one `ms` belongs to (DST-safe). */
export function workDayStart(ms: number, daysAhead = 0): number {
  const d = new Date(workDayOf(ms));
  d.setDate(d.getDate() + daysAhead);
  d.setHours(WORK_DAY_START_HOURS, 0, 0, 0);
  return d.getTime();
}

export interface DoneSources {
  setAsides: readonly SetAside[];
  steps: readonly Step[];
  stepEvents: readonly StepEvent[];
  /** Things the user wrote about their own day. */
  notes?: readonly { at: number; text: string }[];
}

/** Short name of the work a step opens. */
export function workName(step: Step): string {
  if (step.action.type === 'app') return fileWorkName(step.action.name);
  return shortName(cleanTitle(step.action.title) || step.action.title);
}

export function todayDone(src: DoneSources, clock: Clock): string[] {
  const today = workDayOf(clock.now());
  const isToday = (ms: number | null): ms is number => ms !== null && workDayOf(ms) === today;
  const items: { at: number; text: string }[] = [];

  for (const sa of src.setAsides) {
    if (!isToday(sa.endedAt) || !sa.result) continue;
    if (sa.status !== 'applied' && sa.status !== 'partial') continue;
    const groups = sa.result.grouped.filter((g) => g.tabIds.length > 0);
    const tabs = groups.reduce((n, g) => n + g.tabIds.length, 0);
    if (tabs > 0) items.push({ at: sa.endedAt, text: done.setAside(tabs, groups.length) });
  }

  const stepById = new Map(src.steps.map((s) => [s.id, s]));
  for (const ev of src.stepEvents) {
    const step = stepById.get(ev.stepId);
    if (!step || !isToday(ev.clickedAt)) continue;
    items.push({ at: ev.clickedAt, text: done.stepClicked(workName(step)) });
    if (ev.stillWorkingAt10m === true) {
      items.push({ at: ev.clickedAt + STILL_WORKING_AFTER_MS, text: done.keptGoing(workName(step)) });
    }
  }

  for (const n of src.notes ?? []) {
    const text = n.text.trim();
    if (text && isToday(n.at)) items.push({ at: n.at, text });
  }

  const seen = new Set<string>();
  return items
    .sort((a, b) => a.at - b.at)
    .map((i) => i.text)
    .filter((t) => (seen.has(t) ? false : (seen.add(t), true)));
}

/** One line for Mini: the user's own words first, else the latest confirmed event, else null. */
export function todayLine(lines: readonly string[], userWords: readonly string[] = []): string | null {
  const own = userWords.map((w) => w.trim()).filter(Boolean);
  if (own.length) return own[own.length - 1];
  return lines.length ? lines[lines.length - 1] : null;
}
