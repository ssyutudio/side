// The one function behind every number Mini and Main show, so the two can never
// disagree. Tabs folded into a Side group are still open in Chrome: they count
// as "set aside", not also as "open". Only the latest set-aside's closed tabs
// count as set aside now, so nothing piles up over days. Rates carry their
// sample size and are null when there is no data.
import type { SetAside, Step, StepEvent, TabsReport } from '@side/shared';
import { latestSetAside } from './step';
import { secondsToWork } from './stepEvents';
import { todayLine, workDayOf } from './todayDone';

export interface NumbersInput {
  /** Latest report from the extension, or null when Chrome is not connected. */
  report: TabsReport | null;
  /** Names of the Chrome groups Side created. */
  sideGroupNames: readonly string[];
  setAsides: readonly SetAside[];
  steps: readonly Step[];
  stepEvents: readonly StepEvent[];
  currentStep: Step | null;
  todayLines: readonly string[];
  userWords?: readonly string[];
  /** Times sidy spoke first. */
  spokeAt: readonly number[];
  now: number;
}

export interface Rate {
  value: number | null;
  n: number;
}

export interface SideNumbers {
  connected: boolean;
  tabsInChrome: number | null;
  tabsOpen: number | null;
  tabsSetAside: number | null;
  stepReady: boolean;
  todayLine: string | null;
  spokeToday: number;
  spokeTotal: number;
  shown: number;
  clicked: number;
  clickRate: Rate;
  stillWorkingRate: Rate;
  lastSecondsToWork: number | null;
  setAsideTotals: { tabs: number; lines: number };
}

const rate = (hits: number, n: number): Rate => ({ value: n > 0 ? hits / n : null, n });

export function sideNumbers(i: NumbersInput): SideNumbers {
  let tabsInChrome: number | null = null;
  let tabsOpen: number | null = null;
  let tabsSetAside: number | null = null;
  if (i.report) {
    const s = i.report.skipped;
    tabsInChrome = i.report.tabs.length + s.excluded + s.incognito + s.internal;
    const folded = i.report.tabs.filter((t) => t.groupTitle !== null && i.sideGroupNames.includes(t.groupTitle)).length;
    const latest = latestSetAside(i.setAsides, i.now);
    const closed = latest?.result?.closed.length ?? 0;
    tabsOpen = tabsInChrome - folded;
    tabsSetAside = folded + closed;
  }

  const eventFor = (stepId: string) => i.stepEvents.find((e) => e.stepId === stepId);
  const stepReady = i.currentStep !== null && (eventFor(i.currentStep.id)?.openedAt ?? null) === null;

  const today = workDayOf(i.now);
  const spokeToday = i.spokeAt.filter((t) => workDayOf(t) === today).length;

  const shownEvents = i.stepEvents.filter((e) => e.shownAt !== null);
  // A step counts as opened only once Chrome (or the app) confirmed it; clickedAt stays the click record.
  const clicked = i.stepEvents.filter((e) => e.openedAt !== null);
  const judged = i.stepEvents.filter((e) => e.stillWorkingAt10m !== null);
  const kept = judged.filter((e) => e.stillWorkingAt10m === true);
  const lastClicked = [...clicked].sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0))[0];

  let totalTabs = 0;
  let totalLines = 0;
  for (const sa of i.setAsides) {
    if (sa.userLine && sa.status !== 'undone') totalLines++;
    if (!sa.result || (sa.status !== 'applied' && sa.status !== 'partial')) continue;
    const ids = new Set<number>([...sa.result.grouped.flatMap((g) => g.tabIds), ...sa.result.closed]);
    totalTabs += ids.size;
  }

  return {
    connected: i.report !== null,
    tabsInChrome,
    tabsOpen,
    tabsSetAside,
    stepReady,
    todayLine: todayLine(i.todayLines, i.userWords ?? []),
    spokeToday,
    spokeTotal: i.spokeAt.length,
    shown: shownEvents.length,
    clicked: clicked.length,
    clickRate: rate(shownEvents.filter((e) => e.openedAt !== null).length, shownEvents.length),
    stillWorkingRate: rate(kept.length, judged.length),
    lastSecondsToWork: lastClicked ? secondsToWork(lastClicked) : null,
    setAsideTotals: { tabs: totalTabs, lines: totalLines },
  };
}
