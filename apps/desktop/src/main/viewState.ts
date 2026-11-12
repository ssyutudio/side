// Everything the screens show, built in one place from the data file and the latest tab report.
// Mini and Main read the same object, so their numbers cannot disagree. The top item is the one
// next step; numbers are supporting detail. No backlog counts exist anywhere in here.
import { hostOf, type KeepReason, type QuietReason, type SetAside, type SetAsideStatus, type Settings, type SkippedSummary, type TabsReport } from '@side/shared';
import type { AppData } from './appData';
import type { BridgeStatus } from './bridge';
import type { Bubble } from './speakService';
import { currentStep, enabledApps, latestSetAside, stepLabelFor } from '../core/step';
import { displayGroupName } from '../core/grouping';
import { t } from '../i18n';
import { sideNumbers, type SideNumbers } from '../core/stats';
import { dayKind, dayLabel } from '../core/dateLabel';
import { todayDone, workDayOf, workName } from '../core/todayDone';
import { done } from '../core/copy';
import { STILL_WORKING_AFTER_MS, type PagePosition } from '@side/shared';
import { secondsToWork } from '../core/stepEvents';
import { activePromise } from '../core/promise';
import { ruleBySide } from '../core/llmHelpBySide';

export interface ViewState {
  /** Settings → Connections: desktop apps found on this computer and which are on. */
  connections?: { apps: { id: string; tool: string; on: boolean }[]; calendar?: { on: boolean; status: string; firstTomorrow: number | null } };
  /** Side's clock (demo clock included), so screens can show times. */
  now: number;
  connection: BridgeStatus;
  step: { id: string; label: string; when: string; whenKind: 'today' | 'yesterday' | 'earlier'; host: string | null; hasPosition: boolean } | null;
  bubble: Bubble | null;
  numbers: SideNumbers;
  todayLines: string[];
  /** Today's confirmed moments with their times, oldest first (Main "Today so far"). */
  timeline: { at: number; text: string; strong: boolean }[];
  lastWrapup: {
    id: string;
    status: SetAsideStatus;
    when: string;
    /** Which day `when` names, for code that decides by it (the label itself is translated). */
    whenKind: 'today' | 'yesterday' | 'earlier';
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
    /** Read from the last confirmed Wrap up, or from Chrome right now before any Wrap up. */
    source: 'last_wrapup' | 'live';
    when: string | null;
    readTabs: number;
    withPosition: number;
    hosts: { host: string; count: number }[];
    /** Each tab read from Chrome: title, site and where the reading position is. No page text sent anywhere. */
    tabs: { title: string; host: string | null; where: string }[];
    skipped: SkippedSummary;
    llm: {
      enabled: boolean;
      /** False without a Claude key on this computer: nothing can be sent, rules do everything. */
      available: boolean;
      sends: number;
      lastAt: number | null;
      lastTitles: number | null;
      lastUserLine: boolean;
      /** Every kind of thing sent in the kept log (counts only), so the screen can name them all. */
      sent: { groupTitles: number | null; groupNames: boolean; stepPick: boolean; stepFiles: number; stepCounts: boolean; askLine: boolean };
    };
    uploadEnabled: boolean;
  };
  quiet: { last: { at: number; reason: QuietReason } | null; today: Partial<Record<QuietReason, number>> };
  promise: { id: string; dueAt: number; minutes: number } | null;
  settings: Settings;
  hidden: boolean;
  focusUntil: number | null;
  demoOffsetMs: number;
  /** Show the Demo clock in Settings: Side was started with SIDE_DEMO, or demo time is on now. */
  demoTools: boolean;
  /** One sentence from the user's own counts (rule, or Claude's from the numbers only). */
  bySide: { text: string; byClaude: boolean };
}

export interface ViewInput {
  data: AppData;
  report: TabsReport | null;
  bridge: BridgeStatus;
  bubble: Bubble | null;
  now: number;
  /** Claude's sentence when the controller has one for these counts; otherwise the rule is used. */
  bySide?: { text: string; byClaude: boolean };
  /** Whether a Claude key is set on this computer. Missing: assumed yes. */
  llmAvailable?: boolean;
}

/** Where the user was on a page, in words. */
function whereOf(p: PagePosition | null): string {
  if (!p) return t('Not captured');
  if (p.quote) return `“${p.quote}”`;
  if (p.ratio > 0) return t('{percent}% down the page', { percent: Math.round(p.ratio * 100) });
  return t('Top of page');
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
    if (isToday(ev.shownAt)) items.push({ at: ev.shownAt, text: t('sidy offered one step: {work}', { work }), strong: true });
    if (isToday(ev.clickedAt)) {
      const secs = secondsToWork(ev);
      items.push({ at: ev.clickedAt, text: secs === null ? t('You stepped inside') : t('You stepped inside — page ready in {secs} s', { secs: secs.toFixed(1) }), strong: true });
      const at = ev.clickedAt + STILL_WORKING_AFTER_MS;
      if (ev.stillWorkingAt10m === true) items.push({ at, text: t('Still on {work} 10 minutes later', { work }), strong: false });
      if (ev.stillWorkingAt10m === false) items.push({ at, text: t('Moved on within 10 minutes'), strong: false });
    }
  }
  return items.sort((a, b) => a.at - b.at);
}

const EMPTY_SKIPPED: SkippedSummary = { excluded: 0, excludedByDomain: {}, incognito: 0, internal: 0 };
const HISTORY_MAX = 30;

export function buildViewState(input: ViewInput): ViewState {
  const { data, report, bridge, bubble, now } = input;
  const clock = { now: () => now };
  const live = data.setAsides.filter((s) => s.status === 'applied' || s.status === 'partial');
  const sideGroupNames = live.flatMap((s) => s.groups.map((g) => g.name));
  const step = currentStep(data.setAsides, data.steps, data.settings.excludedDomains, clock, undefined, { enabled: enabledApps(data.settings) });
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
  const latest = latestSetAside(data.setAsides, now);
  // What Side saw: the last confirmed Wrap up when there is one, so it survives Chrome being closed.
  const liveSa = latest && (latest.status === 'applied' || latest.status === 'partial') ? latest : null;



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
          label: stepLabelFor(step, stepSa),
          when: dayLabel(stepSa?.endedAt ?? step.createdAt, now),
          whenKind: dayKind(stepSa?.endedAt ?? step.createdAt, now),
          host: step.action.type === 'open_url' ? hostOf(step.action.url) : null,
          hasPosition: step.action.type === 'open_url' && step.action.position !== null,
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
          whenKind: dayKind(latest.endedAt, now),
          groups: latest.groups.map((g) => ({ key: g.key, name: displayGroupName(g.key, g.name), count: g.tabIds.length })),
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
          groups: sa.groups.map((g) => displayGroupName(g.key, g.name)),
          userLine: sa.userLine,
          status: sa.status,
          step: st
            ? {
                label: stepLabelFor(st, sa),
                shown: !!ev?.shownAt,
                clicked: !!ev?.clickedAt,
                stillWorking: ev?.stillWorkingAt10m ?? null,
                secondsToWork: ev ? secondsToWork(ev) : null,
              }
            : null,
        };
      }),
    saw: { ...sawFrom(liveSa, report, now), llm: llmSeen(data, input.llmAvailable !== false), uploadEnabled: data.settings.uploadEnabled },
    quiet: {
      last: data.quietLog.length ? data.quietLog.reduce((a, b) => (b.at >= a.at ? b : a)) : null,
      today: quietToday,
    },
    promise: promise ? { id: promise.id, dueAt: promise.dueAt, minutes: promise.minutes } : null,
    settings: data.settings,
    hidden: data.hidden,
    focusUntil: data.focusUntil,
    demoOffsetMs: data.demoOffsetMs,
    demoTools: data.demoOffsetMs !== 0,
    bySide: input.bySide ?? { text: ruleBySide(numbers), byClaude: false },
  };
}

function sawFrom(sa: SetAside | null, report: TabsReport | null, now: number) {
  if (sa) {
    const hosts = new Map<string, number>();
    for (const t of sa.tabs) {
      const h = hostOf(t.url);
      if (h) hosts.set(h, (hosts.get(h) ?? 0) + 1);
    }
    return {
      source: 'last_wrapup' as const,
      when: dayLabel(sa.endedAt, now),
      readTabs: sa.tabs.length + sa.kept.length,
      withPosition: sa.tabs.filter((t) => t.position && t.position.top > 0).length,
      hosts: [...hosts.entries()].map(([host, count]) => ({ host, count })),
      tabs: [
        ...sa.tabs.map((t) => ({ title: t.title, host: hostOf(t.url), where: whereOf(t.position) })),
        ...sa.kept.map((k) => ({ title: k.title, host: null, where: t('Left open') })),
      ],
      skipped: sa.skipped ?? EMPTY_SKIPPED,
    };
  }
  const counts = new Map<string, number>();
  for (const t of report?.tabs ?? []) {
    const h = hostOf(t.url);
    if (h) counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  return {
    source: 'live' as const,
    when: null,
    readTabs: report?.tabs.length ?? 0,
    withPosition: (report?.tabs ?? []).filter((t) => t.position && t.position.top > 0).length,
    hosts: [...counts.entries()].map(([host, count]) => ({ host, count })),
    tabs: (report?.tabs ?? []).map((t) => ({ title: t.title, host: hostOf(t.url), where: whereOf(t.position) })),
    skipped: report?.skipped ?? EMPTY_SKIPPED,
  };
}

/** What went to Claude: the last request that carried tab titles (grouping), not a titles-free one. */
/** The kind of an older log entry, worked out from its counts. */
function kindOf(e: AppData['llmLog'][number]): NonNullable<AppData['llmLog'][number]['kind']> | 'groupNamesOrCounts' {
  if (e.kind) return e.kind;
  if (e.titles > 0) return e.userLine ? 'step' : 'group';
  return e.userLine ? 'ask' : 'groupNamesOrCounts';
}

function llmSeen(data: AppData, available: boolean) {
  const titled = [...data.llmLog].reverse().find((e) => e.titles > 0) ?? null;
  const kinds = data.llmLog.map(kindOf);
  const lastGroup = [...data.llmLog].reverse().find((e) => kindOf(e) === 'group');
  const steps = data.llmLog.filter((e) => kindOf(e) === 'step');
  return {
    enabled: data.settings.llmEnabled,
    available,
    sent: {
      groupTitles: lastGroup ? lastGroup.titles : null,
      groupNames: kinds.includes('suggest') || kinds.includes('groupNamesOrCounts'),
      stepPick: steps.length > 0,
      stepFiles: steps.reduce((n, e) => Math.max(n, e.files ?? 0), 0),
      stepCounts: kinds.includes('bySide') || kinds.includes('groupNamesOrCounts'),
      askLine: kinds.includes('ask'),
    },
    sends: data.llmLog.length,
    lastAt: data.llmLog.length ? data.llmLog[data.llmLog.length - 1].at : null,
    lastTitles: titled ? titled.titles : null,
    lastUserLine: titled ? titled.userLine : false,
  };
}
