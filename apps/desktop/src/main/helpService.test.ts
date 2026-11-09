import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SetAside, Step, OpenUrlAction } from '@side/shared';
import { JsonStore } from './store';
import { defaultAppData, type AppData } from './appData';
import { HelpService } from './helpService';

const sa: SetAside = {
  id: 'sa1', endedAt: 1, status: 'applied', result: null, kept: [], todayDone: [], closeRequested: false,
  userLine: 'Why does the 429 retry need jitter?',
  groups: [{ key: 'g1', name: 'Retry research', tabIds: [11, 12], source: 'llm' }, { key: 'g2', name: 'Client work', tabIds: [14], source: 'llm' }],
  tabs: [
    { tabId: 11, url: 'https://github.com/acme/ws/1', title: 'WebSocket reconnect issue', lastAccessed: 9, position: null, groupKey: 'g1' },
    { tabId: 12, url: 'https://en.wikipedia.org/wiki/Exponential_backoff', title: 'Exponential backoff - Wikipedia', lastAccessed: 1, position: null, groupKey: 'g1' },
    { tabId: 14, url: 'https://client-bank.com/acct', title: 'Client 991 balance', lastAccessed: 2, position: null, groupKey: 'g2' },
  ],
};
const ruleStep: Step = {
  id: 'rule', fromSetAside: 'sa1', createdAt: 1, label: 'x', source: 'rule',
  action: { type: 'open_url', url: sa.tabs[0].url, title: sa.tabs[0].title, position: null },
  checks: { noJudgment: true, cannotFail: true, inRealTool: true, resultVisible: true },
};

async function setup(llmEnabled: boolean, reply: (sent: string) => Promise<string>) {
  const store = new JsonStore<AppData>(join(mkdtempSync(join(tmpdir(), 'side-help-')), 'd.json'), () => {
    const d = defaultAppData();
    return { ...d, settings: { ...d.settings, llmEnabled, excludedDomains: ['client-bank.com'] }, setAsides: [sa], steps: [ruleStep] };
  });
  await store.load();
  const sent: string[] = [];
  const svc = new HelpService({
    store,
    clock: { now: () => 100 },
    llm: async (req) => {
      const body = req.system + '\n' + req.user;
      sent.push(body);
      return reply(body);
    },
    timeoutMs: 200,
  });
  return { store, svc, sent };
}

describe('HelpService suggestions', () => {
  it('asks once per wrap-up with group names only and caches the answer', async () => {
    const { svc, sent } = await setup(true, async () => '{"suggestions":["Why does the backoff need a cap?","What breaks on reconnect?"]}');
    expect(await svc.suggest('sa1')).toEqual(['Why does the backoff need a cap?', 'What breaks on reconnect?']);
    expect(await svc.suggest('sa1')).toHaveLength(2);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('Retry research');
    expect(sent[0]).not.toContain('WebSocket reconnect issue');
    expect(sent[0]).not.toMatch(/https?:\/\//);
  });

  it('makes zero calls and offers nothing when the LLM is off', async () => {
    const { svc, sent } = await setup(false, async () => '{"suggestions":["A?"]}');
    expect(await svc.suggest('sa1')).toEqual([]);
    expect(sent).toHaveLength(0);
  });

  it('offers nothing when the answer is late', async () => {
    const { svc } = await setup(true, () => new Promise((r) => setTimeout(() => r('{"suggestions":["Late one here?"]}'), 400)));
    expect(await svc.suggest('sa1')).toEqual([]);
  });
});

describe('HelpService morning recall', () => {
  it('replaces the rule step with the tab Claude picked from the ids it was sent', async () => {
    const { svc, store, sent } = await setup(true, async () => '{"id":"T2"}');
    expect(await svc.recall('sa1')).toBe('replaced');
    const steps = store.get().steps.filter((s) => s.fromSetAside === 'sa1');
    expect(steps).toHaveLength(1);
    expect((steps[0].action as OpenUrlAction).url).toBe('https://en.wikipedia.org/wiki/Exponential_backoff');
    expect(sent[0]).not.toContain('Client 991');
    expect(sent[0]).not.toMatch(/https?:\/\//);
    expect(store.get().llmLog.at(-1)).toMatchObject({ titles: 2, userLine: true });
  });

  it('keeps the rule step for an unknown id, a late answer, or LLM off', async () => {
    for (const [on, reply] of [
      [true, async () => '{"id":"T7"}'],
      [true, () => new Promise<string>((r) => setTimeout(() => r('{"id":"T2"}'), 400))],
      [false, async () => '{"id":"T2"}'],
    ] as const) {
      const { svc, store } = await setup(on, reply);
      expect(await svc.recall('sa1')).not.toBe('replaced');
      expect(store.get().steps).toEqual([ruleStep]);
    }
  });

  it('does not swap a step that was already shown', async () => {
    const { svc, store } = await setup(true, async () => '{"id":"T2"}');
    await store.update((d) => ({ ...d, stepEvents: [{ stepId: 'rule', shownAt: 50, clickedAt: null, openedAt: null, stillWorkingAt10m: null, dismissed: null }] }));
    expect(await svc.recall('sa1')).toBe('kept');
    expect(store.get().steps[0].id).toBe('rule');
  });
});

import type { SideNumbers } from '../core/stats';
const nums = (clicked: number, judged: number, rate: number): SideNumbers => ({
  connected: true, tabsInChrome: 30, tabsOpen: 5, tabsSetAside: 25, stepReady: true, todayLine: null,
  spokeToday: 1, spokeTotal: 6, shown: 6, clicked, clickRate: { value: 0.8, n: 6 }, stillWorkingRate: { value: rate, n: judged },
  lastSecondsToWork: 1.4, setAsideTotals: { tabs: 80, lines: 3 },
});

describe('HelpService By your side', () => {
  it('uses the still-learning rule below three opened steps, with no call', async () => {
    const { svc, sent } = await setup(true, async () => 'x.');
    expect(svc.bySideFor(nums(2, 1, 1))).toEqual({ text: expect.stringContaining('still learning'), byClaude: false });
    expect(sent).toHaveLength(0);
  });

  it('asks once per change in counts and then shows Claude\'s sentence', async () => {
    const { svc, sent } = await setup(true, async () => '3 of the 4 steps you could judge kept you going past 10 minutes.');
    const updated = new Promise<void>((r) => expect(svc.bySideFor(nums(5, 4, 0.75), r).byClaude).toBe(false));
    await updated;
    expect(svc.bySideFor(nums(5, 4, 0.75))).toEqual({ text: '3 of the 4 steps you could judge kept you going past 10 minutes.', byClaude: true });
    svc.bySideFor(nums(5, 4, 0.75));
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toMatch(/https?:|github|Retry|jitter/i);
  });

  it('keeps the rule sentence when Claude invents a number, and calls nothing when off', async () => {
    const bad = await setup(true, async () => '9 steps kept you going.');
    await new Promise<void>((r) => { bad.svc.bySideFor(nums(5, 4, 0.75), r); setTimeout(r, 300); });
    expect(bad.svc.bySideFor(nums(5, 4, 0.75)).byClaude).toBe(false);
    const off = await setup(false, async () => 'x.');
    expect(off.svc.bySideFor(nums(5, 4, 0.75)).byClaude).toBe(false);
    expect(off.sent).toHaveLength(0);
  });
});
