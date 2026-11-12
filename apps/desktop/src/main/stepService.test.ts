import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STILL_WORKING_AFTER_MS, type SetAside, type Step, type TabsReport, type OpenUrlAction } from '@side/shared';
import { JsonStore } from './store';
import { defaultAppData, type AppData } from './appData';
import { StepService, activeUrlOf } from './stepService';
import { restUntil } from '../core/speakPolicy';
import { markClicked } from '../core/stepEvents';
import type { CommandOutcome } from './bridge';

let now = new Date(2026, 10, 10, 19, 0).getTime();
const clock = { now: () => now };

const sa: SetAside = {
  id: 'sa1', endedAt: new Date(2026, 10, 9, 23, 50).getTime(),
  tabs: [{ tabId: 1, url: 'https://github.com/acme/retry-lib/issues/12', title: 'Retry jitter', lastAccessed: 1, position: null, groupKey: 'g1' }],
  groups: [{ key: 'g1', name: 'retry-lib', tabIds: [1], source: 'rule' }],
  kept: [], userLine: null, todayDone: [], closeRequested: false, status: 'applied', result: null,
};
const step: Step = {
  id: 'st1', fromSetAside: 'sa1', createdAt: sa.endedAt, label: 'retry-lib is ready to open.',
  action: { type: 'open_url', url: sa.tabs[0].url, title: 'Retry jitter', position: null },
  checks: { noJudgment: true, cannotFail: true, inRealTool: true, resultVisible: true }, source: 'rule',
};

class Port {
  sent: { type: string; payload: unknown }[] = [];
  constructor(public answer: CommandOutcome) {}
  async command(type: any, payload: any) {
    this.sent.push({ type, payload });
    return this.answer;
  }
}

async function setup(answer: CommandOutcome) {
  const store = new JsonStore<AppData>(join(mkdtempSync(join(tmpdir(), 'side-step-')), 'd.json'), () => ({ ...defaultAppData(), setAsides: [sa], steps: [step] }));
  await store.load();
  const port = new Port(answer);
  return { store, port, svc: new StepService({ store, port, clock }) };
}

function report(url: string): TabsReport {
  return {
    tabs: [{ tabId: 9, windowId: 1, index: 0, url, title: 't', lastAccessed: now, active: true, pinned: false, audible: false, incognito: false, groupId: -1, groupTitle: null, position: null }],
    skipped: { excluded: 0, excludedByDomain: {}, incognito: 0, internal: 0 },
    capturedAt: now,
  };
}

describe('StepService', () => {
  it('offers the one current step', async () => {
    const { svc } = await setup({ status: 'ok', result: {} });
    expect(svc.current()?.id).toBe('st1');
  });

  it('records shown only when the bubble was drawn while visible and awake', async () => {
    const { svc, store } = await setup({ status: 'ok', result: {} });
    await svc.shown('st1', { hidden: true, asleep: false });
    expect(store.get().stepEvents).toEqual([]);
    await svc.shown('st1', { hidden: false, asleep: false });
    expect(store.get().stepEvents[0].shownAt).toBe(now);
  });

  it('opens the page only on click and records seconds to work', async () => {
    const { svc, store, port } = await setup({ status: 'ok', result: { tabId: 4, restored: 'exact' } });
    expect(port.sent).toHaveLength(0);
    const out = await svc.open('st1');
    expect(out).toMatchObject({ kind: 'opened', restored: 'exact' });
    expect(port.sent[0]).toEqual({ type: 'cmd.step.open', payload: { stepId: 'st1', url: (step.action as OpenUrlAction).url, position: null } });
    const ev = store.get().stepEvents[0];
    expect(ev.clickedAt).toBe(now);
    expect(ev.openedAt).toBe(now);
  });

  it('keeps the click but no open time when Chrome did not confirm', async () => {
    const { svc, store } = await setup({ status: 'unconfirmed', reason: 'timeout' });
    expect((await svc.open('st1')).kind).toBe('unconfirmed');
    expect(store.get().stepEvents[0].clickedAt).toBe(now);
    expect(store.get().stepEvents[0].openedAt).toBeNull();
  });

  it('remembers Rest today until the next work day starts', async () => {
    const { svc, store } = await setup({ status: 'ok', result: {} });
    await svc.dismiss('st1', 'rest_today');
    expect(store.get().stepEvents[0].dismissed).toBe('rest_today');
    expect(store.get().restedUntil).toBe(restUntil(now));
  });

  it('judges still working ten minutes after the click from the active tab', async () => {
    const { svc, store } = await setup({ status: 'ok', result: { tabId: 4, restored: 'top' } });
    await svc.open('st1');
    await svc.observe(report('https://github.com/acme/retry-lib/pull/31'));
    expect(store.get().stepEvents[0].stillWorkingAt10m).toBeNull();
    now += STILL_WORKING_AFTER_MS + 1;
    await svc.observe(report('https://github.com/acme/retry-lib/pull/31'));
    expect(store.get().stepEvents[0].stillWorkingAt10m).toBe(true);
  });
});

describe('StepService writes', () => {
  it('opens a step with a longer wait than the default, since Chrome may load and restore first', async () => {
    const seen: unknown[] = [];
    const { store } = await setup({ status: 'ok', result: {} });
    const port = { command: async (_t: any, _p: any, ms?: number) => (seen.push(ms), { status: 'ok', result: {} } as CommandOutcome) };
    await new StepService({ store, port, clock }).open('st1');
    expect(seen).toEqual([30_000]);
  });

  it('observe keeps an event recorded while its own write was queued', async () => {
    const { svc, store } = await setup({ status: 'ok', result: { tabId: 4, restored: 'top' } });
    await svc.open('st1');
    now += STILL_WORKING_AFTER_MS + 1;
    const real = store.update.bind(store);
    let injected = false;
    store.update = (fn) => {
      if (!injected) {
        injected = true;
        void real((d) => ({ ...d, stepEvents: markClicked(d.stepEvents, 'other', now) }));
      }
      return real(fn);
    };
    await svc.observe(report('https://github.com/acme/retry-lib/pull/31'));
    expect(store.get().stepEvents.map((e) => e.stepId)).toEqual(['st1', 'other']);
    expect(store.get().stepEvents[0].stillWorkingAt10m).toBe(true);
  });
});

describe('activeUrlOf', () => {
  it('picks the most recently used active tab', () => {
    const r = report('https://a.example/');
    r.tabs.push({ ...r.tabs[0], tabId: 10, windowId: 2, url: 'https://b.example/', lastAccessed: now + 5 });
    expect(activeUrlOf(r)).toBe('https://b.example/');
    expect(activeUrlOf(null)).toBeUndefined();
  });
});
