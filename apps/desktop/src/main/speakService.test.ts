import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SPEAK_COOLDOWN_MS, type SetAside, type Step } from '@side/shared';
import { JsonStore } from './store';
import { defaultAppData, type AppData } from './appData';
import { SpeakService, type Bubble } from './speakService';

let now = new Date(2026, 10, 10, 19, 0).getTime();
const clock = { now: () => now };

const sa: SetAside = {
  id: 'sa1', endedAt: new Date(2026, 10, 9, 23, 50).getTime(),
  tabs: [{ tabId: 1, url: 'https://github.com/acme/retry-lib/issues/12', title: 'Retry jitter', lastAccessed: 1, position: null, groupKey: 'g1' }],
  groups: [{ key: 'g1', name: 'retry-lib', tabIds: [1], source: 'rule' }],
  kept: [], userLine: null, todayDone: ['Set aside 1 tab in 1 group.'], closeRequested: false, status: 'applied', result: null,
};
const step: Step = {
  id: 'st1', fromSetAside: 'sa1', createdAt: sa.endedAt, label: 'retry-lib is ready to open.',
  action: { type: 'open_url', url: sa.tabs[0].url, title: 'Retry jitter', position: null },
  checks: { noJudgment: true, cannotFail: true, inRealTool: true, resultVisible: true }, source: 'rule',
};

async function setup(seed: Partial<AppData> = {}, busy?: () => boolean) {
  const store = new JsonStore<AppData>(join(mkdtempSync(join(tmpdir(), 'side-speak-')), 'd.json'), () => ({ ...defaultAppData(), setAsides: [sa], steps: [step], ...seed }));
  await store.load();
  const shown: (Bubble | null)[] = [];
  const svc = new SpeakService({ store, clock, render: (b) => shown.push(b), busy });
  return { store, svc, shown };
}

describe('SpeakService', () => {
  beforeEach(() => {
    now = new Date(2026, 10, 10, 19, 0).getTime();
  });

  it('speaks once at a return moment with the one step', async () => {
    const { svc, shown } = await setup();
    await svc.trigger('app_start');
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ kind: 'step', stepId: 'st1' });
  });

  it('stays quiet within the hour after speaking and logs why', async () => {
    const { svc, shown, store } = await setup();
    await svc.trigger('app_start');
    await svc.confirmDrawn();
    now += 10 * 60_000;
    await svc.trigger('unlock');
    expect(shown).toHaveLength(1);
    expect(store.get().quietLog.at(-1)?.reason).toBe('spoke_recently');
    now += SPEAK_COOLDOWN_MS;
    await svc.trigger('wake');
    expect(shown).toHaveLength(2);
  });

  it('counts a spoken bubble only once it is drawn', async () => {
    const { svc, store } = await setup();
    await svc.trigger('app_start');
    expect(store.get().spokeAt).toEqual([]);
    await svc.confirmDrawn();
    expect(store.get().spokeAt).toEqual([now]);
  });

  it('keeps only the latest missed bubble while hidden and shows it when brought back', async () => {
    const { svc, shown, store } = await setup({ hidden: true });
    await svc.trigger('wake');
    now += 1000;
    await svc.trigger('unlock');
    expect(shown).toHaveLength(0);
    expect(store.get().quietLog.map((q) => q.reason)).toEqual(['hidden', 'hidden']);
    await svc.setHidden(false);
    expect(shown).toHaveLength(1);
  });

  it('says nothing during focus or quiet hours', async () => {
    const focus = await setup({ focusUntil: now + 30 * 60_000 });
    await focus.svc.trigger('idle_return');
    expect(focus.shown).toHaveLength(0);
    expect(focus.store.get().quietLog[0].reason).toBe('focus');

    const quiet = await setup();
    await quiet.store.update((d) => ({ ...d, settings: { ...d.settings, quietHours: { start: 18 * 60, end: 22 * 60 } } }));
    await quiet.svc.trigger('app_start');
    expect(quiet.shown).toHaveLength(0);
  });

  it('One more hour never blocks: saves the summary, then one promise fires exactly once', async () => {
    now = new Date(2026, 10, 10, 1, 0).getTime();
    const { svc, shown, store } = await setup();
    const reply = await svc.oneMoreHour(['Set aside 1 tab in 1 group.']);
    expect(reply.fact).toMatch(/^Sleep now and you get 6 hours before 7:00 AM\.$/);
    await svc.choose(60);
    await svc.choose(30); // last value wins
    expect(store.get().promises.filter((p) => p.firedAt === null)).toHaveLength(1);
    expect(store.get().promises.at(-1)?.summary).toEqual(['Set aside 1 tab in 1 group.']);
    now += 29 * 60_000;
    await svc.tick();
    expect(shown).toHaveLength(0);
    now += 2 * 60_000;
    await svc.tick();
    await svc.tick();
    expect(shown.filter((b) => b?.kind === 'promise')).toEqual([{ kind: 'promise', promiseId: expect.any(String), minutes: 30 }]);
  });

  it('Not today keeps sidy quiet for the rest of the work day', async () => {
    now = new Date(2026, 10, 10, 1, 0).getTime();
    const { svc, shown } = await setup();
    await svc.choose(30);
    now += 31 * 60_000;
    await svc.tick();
    const out = await svc.answer('not_today');
    expect(out.goToWrapup).toBe(false);
    now += SPEAK_COOLDOWN_MS * 2;
    await svc.trigger('unlock');
    expect(shown.filter((b) => b?.kind === 'step')).toHaveLength(0);
  });

  it('Set aside from the check-in goes to the Wrap up preview', async () => {
    now = new Date(2026, 10, 10, 1, 0).getTime();
    const { svc } = await setup();
    await svc.choose(30);
    now += 31 * 60_000;
    await svc.tick();
    expect((await svc.answer('set_aside')).goToWrapup).toBe(true);
  });
});

describe('SpeakService check-in edge cases', () => {
  beforeEach(() => {
    now = new Date(2026, 10, 10, 1, 0).getTime();
  });

  it('keeps the check-in unfired while Mini is open and fires it once Mini is closed', async () => {
    let mini = true;
    const { svc, shown, store } = await setup({}, () => mini);
    await svc.choose(30);
    now += 31 * 60_000;
    expect(await svc.tick()).toBeNull();
    expect(shown).toEqual([]);
    expect(store.get().promises.at(-1)?.firedAt).toBeNull();
    mini = false;
    expect(await svc.tick()).toMatchObject({ kind: 'promise' });
    expect(store.get().promises.at(-1)?.firedAt).not.toBeNull();
  });

  it('clears the drawn bubble when sidy is hidden', async () => {
    const { svc, shown } = await setup();
    await svc.trigger('app_start');
    expect(svc.bubble).not.toBeNull();
    await svc.setHidden(true);
    expect(svc.bubble).toBeNull();
    expect(shown.at(-1)).toBeNull();
  });

  it('logs why a due check-in stayed quiet only once, not on every tick', async () => {
    const { svc, store } = await setup({ hidden: true });
    await svc.choose(30);
    now += 31 * 60_000;
    for (let i = 0; i < 5; i++) {
      await svc.tick();
      now += 30_000;
    }
    expect(store.get().quietLog.filter((q) => q.reason === 'hidden')).toHaveLength(1);
  });
});

describe('SpeakService first run', () => {
  it('opens with a draft made from the real tabs, even with no step yet', async () => {
    const { svc, shown } = await setup({ setAsides: [], steps: [] });
    await svc.firstRun({ tabs: 24, groups: 4 });
    expect(shown[0]).toEqual({ kind: 'first_run', tabs: 24, groups: 4 });
  });

  it('says nothing on first run when there is nothing to fold, or while hidden', async () => {
    const empty = await setup({ setAsides: [], steps: [] });
    await empty.svc.firstRun({ tabs: 0, groups: 0 });
    expect(empty.shown).toEqual([]);
    const hidden = await setup({ setAsides: [], steps: [], hidden: true });
    await hidden.svc.firstRun({ tabs: 5, groups: 2 });
    expect(hidden.shown).toEqual([]);
  });

  it('marks first run done once that bubble is drawn', async () => {
    const { svc, store } = await setup({ setAsides: [], steps: [] });
    await svc.firstRun({ tabs: 5, groups: 2 });
    await svc.confirmDrawn();
    expect(store.get().firstRunDone).toBe(true);
  });
});
