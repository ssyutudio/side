import type { SetAside, Step, TabsReport, TabSnapshot } from '@side/shared';
import { defaultAppData, type AppData } from './appData';
import { buildViewState } from './viewState';

const NOW = new Date(2026, 10, 10, 19, 0).getTime();
const YESTERDAY = new Date(2026, 10, 9, 23, 50).getTime();

function tab(id: number, url: string, extra: Partial<TabSnapshot> = {}): TabSnapshot {
  return { tabId: id, windowId: 1, index: id, url, title: `T${id}`, lastAccessed: NOW, active: false, pinned: false, audible: false, incognito: false, groupId: -1, groupTitle: null, position: null, ...extra };
}

const sa: SetAside = {
  id: 'sa1', endedAt: YESTERDAY,
  tabs: [{ tabId: 1, url: 'https://github.com/acme/retry-lib/issues/12', title: 'Retry jitter', lastAccessed: 1, position: null, groupKey: 'g1' }],
  groups: [{ key: 'g1', name: 'retry-lib', tabIds: [1], source: 'rule' }],
  kept: [{ tabId: 9, title: 'Pitch notes', reason: 'active' }],
  userLine: 'why cap jitter?', todayDone: ['Set aside 1 tab in 1 group.'], closeRequested: false, status: 'applied',
  result: { grouped: [{ key: 'g1', chromeGroupId: 3, tabIds: [1] }], closed: [], kept: [] },
};
const step: Step = {
  id: 'st1', fromSetAside: 'sa1', createdAt: YESTERDAY, label: '“why cap jitter?” — retry-lib is ready to open.',
  action: { type: 'open_url', url: sa.tabs[0].url, title: 'Retry jitter', position: null },
  checks: { noJudgment: true, cannotFail: true, inRealTool: true, resultVisible: true }, source: 'rule',
};

const report: TabsReport = {
  tabs: [
    tab(1, 'https://github.com/acme/retry-lib/issues/12', { groupId: 3, groupTitle: 'retry-lib' }),
    tab(2, 'https://en.wikipedia.org/wiki/Exponential_backoff', { position: { scroller: 'window', selector: null, top: 500, ratio: 0.3, quote: null, capturedAt: NOW } }),
    tab(3, 'https://www.youtube.com/watch?v=x', { active: true }),
  ],
  skipped: { excluded: 2, excludedByDomain: { 'client-bank.com': 2 }, incognito: 1, internal: 1 },
  capturedAt: NOW,
};

function data(extra: Partial<AppData> = {}): AppData {
  return { ...defaultAppData(), setAsides: [sa], steps: [step], ...extra };
}

describe('buildViewState', () => {
  it('puts the one step first, labelled by the real date of its record', () => {
    const v = buildViewState({ data: data(), report, bridge: 'connected', bubble: null, now: NOW });
    expect(v.step).toMatchObject({ id: 'st1', when: 'yesterday', host: 'github.com', hasPosition: false });
    expect(v.step?.label).toContain('retry-lib');
  });

  it('labels a three-day gap by date, never by a backlog count', () => {
    const later = new Date(2026, 10, 12, 19, 0).getTime();
    const v = buildViewState({ data: data(), report, bridge: 'connected', bubble: null, now: later });
    expect(v.step?.when).toMatch(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/);
    expect(JSON.stringify(v)).not.toMatch(/missed|overdue|backlog/i);
  });

  it('gives Mini and Main the same numbers from one place', () => {
    const v = buildViewState({ data: data(), report, bridge: 'connected', bubble: null, now: NOW });
    expect(v.numbers.tabsInChrome).toBe(7);
    expect(v.numbers.tabsSetAside).toBe(1);
    expect(v.numbers.tabsOpen).toBe(6);
  });

  it('before any Wrap up, shows what Side reads from Chrome now and what it skips', () => {
    const v = buildViewState({ data: data({ setAsides: [], steps: [] }), report, bridge: 'connected', bubble: null, now: NOW });
    expect(v.saw.source).toBe('live');
    expect(v.saw.readTabs).toBe(3);
    expect(v.saw.withPosition).toBe(1);
    expect(v.saw.skipped).toEqual({ excluded: 2, excludedByDomain: { 'client-bank.com': 2 }, incognito: 1, internal: 1 });
    expect(v.saw.hosts.map((h) => h.host)).toEqual(['github.com', 'en.wikipedia.org', 'youtube.com']);
    expect(v.saw.llm).toEqual({ enabled: true, sends: 0, lastAt: null, lastTitles: null, lastUserLine: false });
  });

  it('reports the connection truthfully when Chrome is not there', () => {
    const v = buildViewState({ data: data(), report: null, bridge: 'disconnected', bubble: null, now: NOW });
    expect(v.connection).toBe('disconnected');
    expect(v.numbers.tabsInChrome).toBeNull();
  });

  it('explains the last silence and counts silences today by reason', () => {
    const v = buildViewState({
      data: data({ quietLog: [{ at: NOW - 1000, reason: 'focus' }, { at: NOW - 500, reason: 'spoke_recently' }, { at: YESTERDAY - 86_400_000, reason: 'hidden' }] }),
      report, bridge: 'connected', bubble: null, now: NOW,
    });
    expect(v.quiet.last).toEqual({ at: NOW - 500, reason: 'spoke_recently' });
    expect(v.quiet.today).toEqual({ focus: 1, spoke_recently: 1 });
  });

  it('describes the last Wrap up with kept tabs and reasons, and lets only it be undone', () => {
    const v = buildViewState({ data: data(), report, bridge: 'connected', bubble: null, now: NOW });
    expect(v.lastWrapup).toMatchObject({ id: 'sa1', status: 'applied', canUndo: true, userLine: 'why cap jitter?' });
    expect(v.lastWrapup?.groups).toEqual([{ key: 'g1', name: 'retry-lib', count: 1 }]);
    expect(v.lastWrapup?.kept).toEqual([{ title: 'Pitch notes', reason: 'active' }]);
  });

  it('lists past records newest first, each with its own step details', () => {
    const v = buildViewState({
      data: data({ stepEvents: [{ stepId: 'st1', shownAt: NOW - 60_000, clickedAt: NOW - 50_000, openedAt: NOW - 48_000, stillWorkingAt10m: true, dismissed: null }] }),
      report, bridge: 'connected', bubble: null, now: NOW,
    });
    expect(v.history[0]).toMatchObject({ id: 'sa1', when: 'yesterday', tabs: 1, userLine: 'why cap jitter?' });
    expect(v.history[0].step).toMatchObject({ shown: true, clicked: true, stillWorking: true, secondsToWork: 2 });
  });
});

describe('buildViewState for Main', () => {
  it('lists today\'s confirmed moments with their times, oldest first, and nothing from other days', () => {
    const v = buildViewState({
      data: data({
        stepEvents: [{ stepId: 'st1', shownAt: NOW - 40 * 60_000, clickedAt: NOW - 30 * 60_000, openedAt: NOW - 30 * 60_000 + 1400, stillWorkingAt10m: true, dismissed: null }],
      }),
      report, bridge: 'connected', bubble: null, now: NOW,
    });
    expect(v.timeline.map((t) => t.text)).toEqual([
      'sidy offered one step: Retry jitter',
      'You stepped inside — page ready in 1.4 s',
      'Still on Retry jitter 10 minutes later',
    ]);
    expect(v.timeline.map((t) => t.at)).toEqual([NOW - 40 * 60_000, NOW - 30 * 60_000, NOW - 20 * 60_000]);
  });

  it('says what Side read from each tab, and where the reading position is, without page text', () => {
    const r: TabsReport = {
      ...report,
      tabs: [
        ...report.tabs,
        tab(4, 'https://docs.google.com/document/d/x', { title: 'Pricing page — draft', position: { scroller: 'element', selector: '.kix', top: 900, ratio: 0.4, quote: 'Annual plans save 20%, billed once a year', capturedAt: NOW } }),
      ],
    };
    const v = buildViewState({ data: data({ setAsides: [], steps: [] }), report: r, bridge: 'connected', bubble: null, now: NOW });
    const byTitle = Object.fromEntries(v.saw.tabs.map((t) => [t.title, t]));
    expect(byTitle['T2']).toEqual({ title: 'T2', host: 'en.wikipedia.org', where: '30% down the page' });
    expect(byTitle['T1'].where).toBe('Not captured');
    expect(byTitle['Pricing page — draft'].where).toBe('“Annual plans save 20%, billed once a year”');
  });

  it('reports how many titles the last LLM request carried', () => {
    const v = buildViewState({
      data: data({ llmLog: [{ at: NOW - 5000, titles: 36, userLine: true }] }),
      report, bridge: 'connected', bubble: null, now: NOW,
    });
    expect(v.saw.llm).toEqual({ enabled: true, sends: 1, lastAt: NOW - 5000, lastTitles: 36, lastUserLine: true });
  });
});

describe('buildViewState By your side', () => {
  it('defaults to the rule sentence from the counts, and carries a sentence it is given', () => {
    const v = buildViewState({ data: data(), report, bridge: 'connected', bubble: null, now: NOW });
    expect(v.bySide).toEqual({ text: expect.stringContaining('still learning'), byClaude: false });
    const given = buildViewState({ data: data(), report, bridge: 'connected', bubble: null, now: NOW, bySide: { text: 'Given.', byClaude: true } });
    expect(given.bySide).toEqual({ text: 'Given.', byClaude: true });
  });
});

describe('What Side saw after Chrome disconnects', () => {
  it('shows the last wrap-up (read tabs, skipped counts) instead of saying nothing was read', () => {
    const withSkipped = { ...sa, skipped: { excluded: 2, excludedByDomain: { 'client-bank.com': 2 }, incognito: 0, internal: 1 } };
    const v = buildViewState({ data: data({ setAsides: [withSkipped] }), report: null, bridge: 'disconnected', bubble: null, now: NOW });
    expect(v.saw.source).toBe('last_wrapup');
    expect(v.saw.when).toBe('yesterday');
    expect(v.saw.readTabs).toBe(2);
    expect(v.saw.tabs.map((t) => t.title)).toContain('Retry jitter');
    expect(v.saw.skipped.excludedByDomain).toEqual({ 'client-bank.com': 2 });
  });

  it('counts titles sent from the last grouping request, not from a later titles-free request', () => {
    const v = buildViewState({
      data: data({ llmLog: [{ at: NOW - 2000, titles: 25, userLine: false }, { at: NOW - 1000, titles: 0, userLine: false }] }),
      report, bridge: 'connected', bubble: null, now: NOW,
    });
    expect(v.saw.llm.lastTitles).toBe(25);
  });
});
