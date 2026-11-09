// Everything the screens show, built in one place from the data file and the latest tab report.
// Mini and Main read the same object, so their numbers cannot disagree. The top item is the one
// next step; numbers are supporting detail. No backlog counts exist anywhere in here.
import { hostOf, type KeepReason, type QuietReason, type SetAsideStatus, type Settings, type SkippedSummary, type TabsReport } from '@side/shared';
import type { AppData } from './appData';
import type { BridgeStatus } from './bridge';
import type { Bubble } from './speakService';
import { currentStep, latestSetAside } from '../core/step';
import { sideNumbers, type SideNumbers } from '../core/stats';
import { dayLabel } from '../core/dateLabel';
import { todayDone, workDayOf, workName } from '../core/todayDone';
import { done } from '../core/copy';
import { STILL_WORKING_AFTER_MS, type PagePosition } from '@side/shared';
import { secondsToWork } from '../core/stepEvents';
import { activePromise } from '../core/promise';

export interface ViewState {
  /** Side's clock (demo clock included), so screens can show times. */
  now: number;
  connection: BridgeStatus;
  step: { id: string; label: string; when: string; host: string | null; hasPosition: boolean } | null;
  bubble: Bubble | null;
  numbers: SideNumbers;
  todayLines: string[];
  /** Today's confirmed moments with their times, oldest first (Main "Today so far"). */
  timeline: { at: number; text: string; strong: boolean }[];
  lastWrapup: {
    id: string;
    status: SetAsideStatus;
    when: string;
    groups: { key: string; name: string; count: number }[];
    kept: { title: string; reason: KeepReason }[];
    closed: number;
    userLine: string | null;
    canUndo: boolean;
  } | null;
  history: {
    id: string;
    when: string;
    tabs: number;
    groups: string[];
    userLine: string | null;
    status: SetAsideStatus;
    step: { label: string; shown: boolean; clicked: boolean; stillWorking: boolean | null; secondsToWork: number | null } | null;
  }[];
  saw: {
    readTabs: number;
    withPosition: number;
    hosts: { host: string; count: number }[];
    /** Each tab read from Chrome: title, site and where the reading position is. No page text sent anywhere. */
    tabs: { title: string; host: string | null; where: string }[];
    skipped: SkippedSummary;
    llm: { enabled: boolean; sends: number; lastAt: number | null; lastTitles: number | null; lastUserLine: boolean };
    uploadEnabled: boolean;
  };
  quiet: { last: { at: number; reason: QuietReason } | null; today: Partial<Record<QuietReason, number>> };
  promise: { id: string; dueAt: number; minutes: number } | null;
  settings: Settings;
  hidden: boolean;
  focusUntil: number | null;
  demoOffsetMs: number;
}

export interface ViewInput {
  data: AppData;
  report: TabsReport | null;
  bridge: BridgeStatus;
  bubble: Bubble | null;
  now: number;
}

/** Where the user was on a page, in words. */
function whereOf(p: PagePosition | null): string {
  if (!p) return 'Not captured';
  if (p.quote) return `“${p.quote}”`;
  if (p.ratio > 0) return `${Math.round(p.ratio * 100)}% down the page`;
  return 'Top of page';
}

function buildTimeline(data: AppData, now: number): ViewState['timeline'] {
  const today = workDayOf(now);
  const isToday = (ms: number | null): ms is number => ms !== null && workDayOf(ms) === today;
  const items: ViewState['timeline'] = [];
  for (const sa of data.setAsides) {
    if (!isToday(sa.endedAt) || !sa.result || (sa.status !== 'applied' && sa.status !== 'partial')) continue;
    const groups = sa.result.grouped.filter((g) => g.tabIds.length > 0);
    const tabs = groups.reduce((n, g) => n + g.tabIds.length, 0);
    if (tabs > 0) items.push({ at: sa.endedAt, text: done.setAside(tabs, groups.length), strong: true });
  }
  for (const ev of data.stepEvents) {
    const step = data.steps.find((s) => s.id === ev.stepId);
    if (!step) continue;
    const work = workName(step);
    if (isToday(ev.shownAt)) items.push({ at: ev.shownAt, text: `sidy offered one step: ${work}`, strong: true });
    if (isToday(ev.clickedAt)) {
      const secs = secondsToWork(ev);
      items.push({ at: ev.clickedAt, text: secs === null ? 'You stepped inside' : `You stepped inside — page ready in ${secs.toFixed(1)} s`, strong: true });
      const at = ev.clickedAt + STILL_WORKING_AFTER_MS;
      if (ev.stillWorkingAt10m === true) items.push({ at, text: `Still on ${work} 10 minutes later`, strong: false });
      if (ev.stillWorkingAt10m === false) items.push({ at, text: 'Moved on within 10 minutes', strong: false });
    }
  }
  return items.sort((a, b) => a.at - b.at);
}

const EMPTY_SKIPPED: SkippedSummary = { excluded: 0, excludedByDomain: {}, incognito: 0, internal: 0 };
const HISTORY_MAX = 30;

export function buildViewState({ data, report, bridge, bubble, now }: ViewInput): ViewState {
  const clock = { now: () => now };
  const live = data.setAsides.filter((s) => s.status === 'applied' || s.status === 'partial');
  const sideGroupNames = live.flatMap((s) => s.groups.map((g) => g.name));
  const step = currentStep(data.setAsides, data.steps, data.settings.excludedDomains, clock);
  const todayLines = todayDone({ setAsides: data.setAsides, steps: data.steps, stepEvents: data.stepEvents }, clock);
  const numbers = sideNumbers({
    report,
    sideGroupNames,
    setAsides: data.setAsides,
    steps: data.steps,
    stepEvents: data.stepEvents,
    currentStep: step,
    todayLines,
    spokeAt: data.spokeAt,
    now,
  });

  const stepSa = step ? data.setAsides.find((s) => s.id === step.fromSetAside) : undefined;
  const latest = latestSetAside(data.setAsides);

  const hostCounts = new Map<string, number>();
  for (const t of report?.tabs ?? []) {
    const h = hostOf(t.url);
    if (h) hostCounts.set(h, (hostCounts.get(h) ?? 0) + 1);
  }

  const today = workDayOf(now);
  const quietToday: Partial<Record<QuietReason, number>> = {};
  for (const q of data.quietLog) {
    if (workDayOf(q.at) === today) quietToday[q.reason] = (quietToday[q.reason] ?? 0) + 1;
  }

  const promise = activePromise(data.promises);

  return {
    now,
    connection: bridge,
    step: step
      ? {
          id: step.id,
          label: step.label,
          when: dayLabel(stepSa?.endedAt ?? step.createdAt, now),
          host: hostOf(step.action.url),
          hasPosition: step.action.position !== null,
        }
      : null,
    bubble,
    numbers,
    todayLines,
    timeline: buildTimeline(data, now),
    lastWrapup: latest
      ? {
          id: latest.id,
          status: latest.status,
          when: dayLabel(latest.endedAt, now),
          groups: latest.groups.map((g) => ({ key: g.key, name: g.name, count: g.tabIds.length })),
          kept: latest.kept.map((k) => ({ title: k.title, reason: k.reason })),
          closed: latest.result?.closed.length ?? 0,
          userLine: latest.userLine,
          canUndo: latest.status === 'applied' || latest.status === 'partial' || latest.status === 'unconfirmed',
        }
      : null,
    history: [...data.setAsides]
      .sort((a, b) => b.endedAt - a.endedAt)
      .slice(0, HISTORY_MAX)
      .map((sa) => {
        const st = data.steps.find((s) => s.fromSetAside === sa.id);
        const ev = st ? data.stepEvents.find((e) => e.stepId === st.id) : undefined;
        return {
          id: sa.id,
          when: dayLabel(sa.endedAt, now),
          tabs: sa.tabs.length,
          groups: sa.groups.map((g) => g.name),
          userLine: sa.userLine,
          status: sa.status,
          step: st
            ? {
                label: st.label,
                shown: !!ev?.shownAt,
                clicked: !!ev?.clickedAt,
                stillWorking: ev?.stillWorkingAt10m ?? null,
                secondsToWork: ev ? secondsToWork(ev) : null,
              }
            : null,
        };
      }),
    saw: {
      readTabs: report?.tabs.length ?? 0,
      withPosition: (report?.tabs ?? []).filter((t) => t.position && t.position.top > 0).length,
      hosts: [...hostCounts.entries()].map(([host, count]) => ({ host, count })),
      tabs: (report?.tabs ?? []).map((t) => ({ title: t.title, host: hostOf(t.url), where: whereOf(t.position) })),
      skipped: report?.skipped ?? EMPTY_SKIPPED,
      llm: {
        enabled: data.settings.llmEnabled,
        sends: data.llmLog.length,
        lastAt: data.llmLog.length ? data.llmLog[data.llmLog.length - 1].at : null,
        lastTitles: data.llmLog.length ? data.llmLog[data.llmLog.length - 1].titles : null,
        lastUserLine: data.llmLog.length ? data.llmLog[data.llmLog.length - 1].userLine : false,
      },
      uploadEnabled: data.settings.uploadEnabled,
    },
    quiet: {
      last: data.quietLog.length ? data.quietLog.reduce((a, b) => (b.at >= a.at ? b : a)) : null,
      today: quietToday,
    },
    promise: promise ? { id: promise.id, dueAt: promise.dueAt, minutes: promise.minutes } : null,
    settings: data.settings,
    hidden: data.hidden,
    focusUntil: data.focusUntil,
    demoOffsetMs: data.demoOffsetMs,
  };
}
