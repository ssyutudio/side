import type { SetAside, Step, StepEvent, TabSnapshot, TabsReport } from '@side/shared';
import { sideNumbers, type NumbersInput } from './stats';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

function tab(tabId: number, groupTitle: string | null = null): TabSnapshot {
  return {
    tabId, windowId: 1, index: tabId, url: `https://example.com/${tabId}`, title: `T${tabId}`, lastAccessed: 1,
    active: false, pinned: false, audible: false, incognito: false, groupId: groupTitle ? 7 : -1, groupTitle, position: null,
  };
}

const report: TabsReport = {
  tabs: [tab(1), tab(2), tab(3), tab(4, 'retry-queue'), tab(5, 'retry-queue'), tab(6, 'My trip')],
  skipped: { excluded: 2, excludedByDomain: { 'client-bank.com': 2 }, incognito: 0, internal: 1 },
  capturedAt: 1,
};

const step: Step = {
  id: 's1', fromSetAside: 'sa1', createdAt: 0, label: 'l', source: 'rule',
  action: { type: 'open_url', url: 'https://example.com/1', title: 'T1', position: null },
  checks: { noJudgment: true, cannotFail: true, inRealTool: true, resultVisible: true },
};

const sa: SetAside = {
  id: 'sa1', endedAt: at(9, 23), tabs: [], groups: [], kept: [], userLine: 'Why?', todayDone: [], closeRequested: true, status: 'applied',
  result: { grouped: [{ key: 'g', chromeGroupId: 7, tabIds: [4, 5, 8] }], closed: [8], kept: [] },
};

const base = (over: Partial<NumbersInput> = {}): NumbersInput => ({
  report,
  sideGroupNames: ['retry-queue'],
  setAsides: [sa],
  steps: [step],
  stepEvents: [],
  currentStep: step,
  todayLines: ['Set aside 3 tabs in 1 group.'],
  userWords: [],
  spokeAt: [at(10, 19), at(9, 20)],
  now: at(10, 19, 30),
  ...over,
});

describe('sideNumbers', () => {
  it('matches the Chrome tab count, counting skipped tabs too', () => {
    const n = sideNumbers(base());
    expect(n.tabsInChrome).toBe(9);
  });

  it('counts open and set-aside tabs separately without double counting folded tabs', () => {
    const n = sideNumbers(base());
    expect(n.tabsSetAside).toBe(3); // two folded in Chrome + one Side closed
    expect(n.tabsOpen).toBe(7); // 9 in Chrome minus the 2 folded
  });

  it('reports unknown tab counts when Chrome is not connected', () => {
    const n = sideNumbers(base({ report: null }));
    expect(n.connected).toBe(false);
    expect(n.tabsInChrome).toBeNull();
    expect(n.tabsOpen).toBeNull();
  });

  it('knows whether a step is ready and the line for today', () => {
    expect(sideNumbers(base()).stepReady).toBe(true);
    expect(sideNumbers(base()).todayLine).toBe('Set aside 3 tabs in 1 group.');
    const clicked: StepEvent = { stepId: 's1', shownAt: 1, clickedAt: 2, openedAt: 3, stillWorkingAt10m: null, dismissed: null };
    expect(sideNumbers(base({ stepEvents: [clicked] })).stepReady).toBe(false);
    expect(sideNumbers(base({ currentStep: null })).stepReady).toBe(false);
  });

  it('counts how often sidy spoke today and overall', () => {
    const n = sideNumbers(base());
    expect(n.spokeToday).toBe(1);
    expect(n.spokeTotal).toBe(2);
  });

  it('gives rates with their sample size and no rate without data', () => {
    const evs: StepEvent[] = [
      { stepId: 'a', shownAt: 1, clickedAt: 2, openedAt: 4_000, stillWorkingAt10m: true, dismissed: null },
      { stepId: 'b', shownAt: 1, clickedAt: null, openedAt: null, stillWorkingAt10m: null, dismissed: 'not_now' },
      { stepId: 'c', shownAt: null, clickedAt: null, openedAt: null, stillWorkingAt10m: null, dismissed: null },
    ];
    const n = sideNumbers(base({ stepEvents: evs }));
    expect(n.shown).toBe(2);
    expect(n.clicked).toBe(1);
    expect(n.clickRate).toEqual({ value: 0.5, n: 2 });
    expect(n.stillWorkingRate).toEqual({ value: 1, n: 1 });
    expect(n.lastSecondsToWork).toBeCloseTo(3.998);
    const empty = sideNumbers(base({ stepEvents: [] }));
    expect(empty.clickRate).toEqual({ value: null, n: 0 });
  });

  it('totals what was set aside: tabs and tomorrow lines', () => {
    const n = sideNumbers(base());
    expect(n.setAsideTotals).toEqual({ tabs: 3, lines: 1 });
  });
});
