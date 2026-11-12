import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TabSnapshot, TabsReport, OpenUrlAction } from '@side/shared';
import { JsonStore } from './store';
import { defaultAppData, type AppData } from './appData';
import { SideController, type BridgePort } from './controller';
import type { BridgeStatus, CommandOutcome } from './bridge';
import { DemoClock, fixedClock } from '../core/clock';
import { language, setLanguage } from '../i18n';

const REAL = new Date(2026, 10, 9, 15, 0).getTime();

function tab(id: number, url: string, extra: Partial<TabSnapshot> = {}): TabSnapshot {
  return { tabId: id, windowId: 1, index: id, url, title: `Tab ${id}`, lastAccessed: REAL - id, active: false, pinned: false, audible: false, incognito: false, groupId: -1, groupTitle: null, position: null, ...extra };
}
const report: TabsReport = {
  tabs: [tab(1, 'https://github.com/acme/retry-lib/issues/1'), tab(2, 'https://github.com/acme/retry-lib/issues/2'), tab(3, 'https://news.ycombinator.com/', { active: true })],
  skipped: { excluded: 0, excludedByDomain: {}, incognito: 0, internal: 0 },
  capturedAt: REAL,
};

class FakeBridge implements BridgePort {
  status: BridgeStatus = 'connected';
  sent: { type: string; payload: unknown }[] = [];
  onRequest?: () => void;
  send(type: any, payload: any) {
    this.sent.push({ type, payload });
    if (type === 'tabs.request') this.onRequest?.();
    return this.status === 'connected';
  }
  async command(type: any, p: any): Promise<CommandOutcome> {
    this.sent.push({ type, payload: p });
    if (type === 'cmd.wrapup.apply') {
      return { status: 'ok', result: { grouped: p.groups.map((g: any) => ({ key: g.key, chromeGroupId: 1, tabIds: g.tabIds })), closed: [], kept: [] } };
    }
    return { status: 'ok', result: { tabId: 1, restored: 'exact' } };
  }
}

async function setup(extra: { demoTools?: boolean; llm?: any; report?: TabsReport } = {}) {
  const store = new JsonStore<AppData>(join(mkdtempSync(join(tmpdir(), 'side-ctl-')), 'd.json'), defaultAppData);
  await store.load();
  const bridge = new FakeBridge();
  const resized: string[] = [];
  const shortcuts: string[] = [];
  const bubbles: unknown[] = [];
  const clock = new DemoClock(fixedClock(REAL));
  const ctl = new SideController({
    store, bridge, clock, llm: extra.llm ?? null,
    edge: { resize: (s) => resized.push(s), show: () => undefined, hide: () => undefined },
    registerShortcut: (a) => { shortcuts.push(a); return a !== 'Taken+Key'; },
    push: () => undefined,
    renderBubble: (b) => bubbles.push(b),
    openMain: () => undefined,
    realNow: () => REAL,
    demoTools: extra.demoTools,
  });
  bridge.onRequest = () => setTimeout(() => void ctl.onReport(extra.report ?? report), 5);
  return { store, bridge, ctl, resized, shortcuts, bubbles, clock };
}

describe('SideController language', () => {
  afterEach(() => setLanguage('en'));

  it('tells Chrome and switches the words when the language changes, and only then', async () => {
    const { ctl, bridge } = await setup();
    await ctl.updateSettings({ language: 'ko' });
    expect(bridge.sent.filter((m) => m.type === 'lang.set')).toEqual([{ type: 'lang.set', payload: { lang: 'ko' } }]);
    expect(language()).toBe('ko');
    await ctl.updateSettings({ language: 'ko' });
    expect(bridge.sent.filter((m) => m.type === 'lang.set')).toHaveLength(1);
    await ctl.updateSettings({ language: 'en' });
    expect(bridge.sent.filter((m) => m.type === 'lang.set').pop()).toEqual({ type: 'lang.set', payload: { lang: 'en' } });
    expect(language()).toBe('en');
  });
});

describe('SideController demo clock', () => {
  it('offers the Demo clock only for a demo launch or while demo time is on', async () => {
    expect((await setup()).ctl.state().demoTools).toBe(false);
    expect((await setup({ demoTools: true })).ctl.state().demoTools).toBe(true);
    const { ctl } = await setup();
    await ctl.demo('night');
    expect(ctl.state().demoTools).toBe(true);
    await ctl.demo('reset');
    expect(ctl.state().demoTools).toBe(false);
  });
});

describe('SideController', () => {
  it('asks Chrome for a fresh report before building the Wrap up preview', async () => {
    const { ctl, bridge } = await setup();
    const preview = await ctl.previewWrapup();
    expect(bridge.sent[0].type).toBe('tabs.request');
    expect('groups' in preview && preview.foldCount).toBe(2);
  });

  it('says not connected instead of guessing when Chrome is not there', async () => {
    const { ctl, bridge } = await setup();
    bridge.status = 'disconnected';
    expect(await ctl.previewWrapup()).toEqual({ error: 'not_connected' });
  });

  it('confirms only the previewed groups and needs a preview first', async () => {
    const { ctl, bridge } = await setup();
    expect(await ctl.confirmWrapup([])).toEqual({ kind: 'no_preview' });
    await ctl.previewWrapup();
    const out = await ctl.confirmWrapup(['not-a-group']);
    expect(out.kind).toBe('applied');
    const apply = bridge.sent.find((s) => s.type === 'cmd.wrapup.apply')!.payload as { closeTabIds: number[] };
    expect(apply.closeTabIds).toEqual([]);
  });

  it('applies a new sidy size at once and keeps it in the data file', async () => {
    const { ctl, resized, store } = await setup();
    await ctl.updateSettings({ sidySize: 'large' });
    await ctl.updateSettings({ sidySize: 'medium' });
    expect(resized).toEqual(['large', 'medium']);
    expect(store.get().settings.sidySize).toBe('medium');
  });

  it('sends a changed exclusion list to the extension and asks for a new report', async () => {
    const { ctl, bridge } = await setup();
    await ctl.updateSettings({ excludedDomains: ['https://www.Client-Bank.com/x'] });
    expect(bridge.sent.slice(-2)).toEqual([
      { type: 'exclusions.set', payload: { domains: ['client-bank.com'] } },
      { type: 'tabs.request', payload: {} },
    ]);
  });

  it('keeps the old shortcut when the new one is taken', async () => {
    const { ctl, store } = await setup();
    await ctl.updateSettings({ shortcut: 'Taken+Key' });
    expect(store.get().settings.shortcut).toBe('Control+Alt+S');
  });

  it('moves the demo clock and remembers the offset for the next launch', async () => {
    const { ctl, clock, store } = await setup();
    await ctl.demo('night');
    expect(new Date(clock.now()).getHours()).toBe(1);
    expect(store.get().demoOffsetMs).toBe(clock.offset);
  });

  it('relaunching with the same demo command lands on the same moment instead of jumping again', async () => {
    const { ctl, clock } = await setup();
    await ctl.demo('next-day', 'real');
    const first = clock.now();
    await ctl.demo('next-day', 'real');
    expect(clock.now()).toBe(first);
  });

  it('reset drops spoke times and a rest that lie in the demo future', async () => {
    const { ctl, store } = await setup();
    await ctl.demo('next-day');
    const future = REAL + 3_600_000;
    await store.update((d) => ({ ...d, spokeAt: [REAL - 1000, future], restedUntil: future }));
    await ctl.demo('reset');
    expect(store.get().spokeAt).toEqual([REAL - 1000]);
    expect(store.get().restedUntil).toBeNull();
    expect(store.get().demoOffsetMs).toBe(0);
  });

  it('keeps a setting changed while updateSettings was waiting its turn in the write queue', async () => {
    const { ctl, store } = await setup();
    const real = store.update.bind(store);
    let injected = false;
    store.update = (fn) => {
      if (!injected) {
        injected = true;
        void real((d) => ({ ...d, settings: { ...d.settings, apps: ['figma'] } }));
      }
      return real(fn);
    };
    await ctl.updateSettings({ reactions: false });
    expect(store.get().settings.apps).toEqual(['figma']);
    expect(store.get().settings.reactions).toBe(false);
  });

  it('a reconnect greeting does not replace the draft the user is editing', async () => {
    const { ctl } = await setup();
    const first = await ctl.previewWrapup();
    if ('error' in first) throw new Error('not connected');
    const g = first.groups[0];
    await ctl.editWrapup({ op: 'rename', key: g.key, name: 'My name' });
    await ctl.greetFirstRun();
    // A move onto its own group changes nothing and shows the draft as it now stands.
    const out = await ctl.editWrapup({ op: 'move', tabId: g.tabs[0].id, to: g.key });
    if ('error' in out) throw new Error('no draft');
    expect(out.groups.find((x) => x.key === g.key)?.name).toBe('My name');
  });

  it('records a spoken bubble and a shown step only after the screen drew it', async () => {
    const { ctl, store, clock } = await setup();
    await ctl.previewWrapup();
    await ctl.confirmWrapup([]);
    clock.setOffset(14 * 3600_000); // the step waits for the next work day
    await ctl.speak.trigger('app_start');
    expect(store.get().spokeAt).toEqual([]);
    await ctl.bubbleDrawn();
    expect(store.get().spokeAt).toHaveLength(1);
    expect(store.get().stepEvents[0].shownAt).not.toBeNull();
  });
});

describe('SideController first run', () => {
  it('greets with a rule-based draft of the real tabs when the extension first connects', async () => {
    const { ctl, bubbles } = await setup();
    await ctl.onBridgeStatus('connected');
    // Three tabs are open; the active one stays where it is, so two fold.
    expect(bubbles.at(-1)).toEqual({ kind: 'first_run', tabs: 2, groups: expect.any(Number) });
  });

  it('does not greet again after first run is done', async () => {
    const { ctl, bubbles, store } = await setup();
    await store.update((d) => ({ ...d, firstRunDone: true }));
    await ctl.onBridgeStatus('connected');
    expect(bubbles).toEqual([]);
  });
});

describe('SideController privacy defaults', () => {
  it('never calls the LLM once the user turns it off, even with a key', async () => {
    const store = new JsonStore<AppData>(join(mkdtempSync(join(tmpdir(), 'side-ctl-')), 'd.json'), () => {
      const d = defaultAppData();
      return { ...d, settings: { ...d.settings, llmEnabled: false } };
    });
    await store.load();
    const bridge = new FakeBridge();
    let llmCalls = 0;
    const ctl = new SideController({
      store, bridge, clock: new DemoClock(fixedClock(REAL)),
      llm: async () => { llmCalls++; return '{}'; },
      edge: null, registerShortcut: () => true, push: () => undefined, renderBubble: () => undefined, openMain: () => undefined,
    });
    bridge.onRequest = () => setTimeout(() => void ctl.onReport(report), 5);
    await ctl.previewWrapup();
    expect(llmCalls).toBe(0);
  });
});

describe('SideController step inside right after a relaunch', () => {
  it('waits for Chrome to reconnect before opening, instead of failing at once', async () => {
    const { ctl, bridge } = await setup();
    await ctl.previewWrapup();
    await ctl.confirmWrapup([]);
    const step = ctl.step.current()!;
    bridge.status = 'disconnected';
    setTimeout(() => (bridge.status = 'connected'), 300);
    const out = await ctl.openStep(step.id, 3000);
    expect(out.kind).toBe('opened');
  });

  it('says not connected when Chrome does not come back in time', async () => {
    const { ctl, bridge } = await setup();
    await ctl.previewWrapup();
    await ctl.confirmWrapup([]);
    const step = ctl.step.current()!;
    bridge.status = 'disconnected';
    const out = await ctl.openStep(step.id, 300);
    expect(out).toEqual({ kind: 'unconfirmed', reason: 'not_connected' });
  });
});

describe('SideController night suggestions', () => {
  it('asks Claude for two questions from group names once the result shows, and none when the LLM is off', async () => {
    const store = new JsonStore<AppData>(join(mkdtempSync(join(tmpdir(), 'side-ctl-')), 'd.json'), defaultAppData);
    await store.load();
    const bridge = new FakeBridge();
    const sent: string[] = [];
    const ctl = new SideController({
      store, bridge, clock: new DemoClock(fixedClock(REAL)),
      llm: async (req) => {
        sent.push(req.system + req.user);
        return req.system.includes('two short questions') ? '{"suggestions":["Why does retry need jitter?","What fails on issue 2?"]}' : '{"groups":[]}';
      },
      edge: null, registerShortcut: () => true, push: () => undefined, renderBubble: () => undefined, openMain: () => undefined,
    });
    bridge.onRequest = () => setTimeout(() => void ctl.onReport(report), 5);
    await ctl.previewWrapup();
    const out = await ctl.confirmWrapup([]);
    const id = (out as { setAside: { id: string } }).setAside.id;
    expect(await ctl.suggestTomorrow(id)).toEqual(['Why does retry need jitter?', 'What fails on issue 2?']);
    await ctl.updateSettings({ llmEnabled: false });
    const before = sent.length;
    const fresh = new SideController({
      store, bridge, clock: new DemoClock(fixedClock(REAL)), llm: async () => { sent.push('x'); return '{}'; },
      edge: null, registerShortcut: () => true, push: () => undefined, renderBubble: () => undefined, openMain: () => undefined,
    });
    expect(await fresh.suggestTomorrow(id)).toEqual([]);
    expect(sent.length).toBe(before);
  });
});

describe('SideController morning recall', () => {
  it('after a saved line, moves the one step to the tab Claude picked from the ids it was sent', async () => {
    const store = new JsonStore<AppData>(join(mkdtempSync(join(tmpdir(), 'side-ctl-')), 'd.json'), defaultAppData);
    await store.load();
    const bridge = new FakeBridge();
    const ctl = new SideController({
      store, bridge, clock: new DemoClock(fixedClock(REAL)),
      llm: async (req) => (req.system.includes('Pick the ONE tab') ? '{"id":"T2"}' : '{"groups":[]}'),
      edge: null, registerShortcut: () => true, push: () => undefined, renderBubble: () => undefined, openMain: () => undefined,
    });
    bridge.onRequest = () => setTimeout(() => void ctl.onReport(report), 5);
    await ctl.previewWrapup();
    const out = await ctl.confirmWrapup([]);
    const id = (out as { setAside: { id: string } }).setAside.id;
    await ctl.saveTomorrowLine(id, 'What fails on issue 2?');
    await new Promise((r) => setTimeout(r, 50));
    const steps = store.get().steps.filter((s) => s.fromSetAside === id);
    expect(steps).toHaveLength(1);
    expect((steps[0].action as OpenUrlAction).url).toBe('https://github.com/acme/retry-lib/issues/2');
    expect(steps[0].label).toContain('“What fails on issue 2?”');
  });
});

describe('SideController hand edits to the Wrap up draft', () => {
  it('moves a tab or merges groups, and confirm sends the edited groups', async () => {
    const { ctl, bridge } = await setup();
    const first = await ctl.previewWrapup();
    if ('error' in first) throw new Error('not connected');
    expect(first.groups.flatMap((g) => g.tabs.map((t) => t.id)).sort()).toEqual([1, 2]);
    // Put both tabs into one group by merging the others into the first.
    let view = first;
    for (const g of first.groups.slice(1)) {
      const next = await ctl.editWrapup({ op: 'merge', from: g.key, into: first.groups[0].key });
      if ('error' in next) throw new Error('edit failed');
      view = next;
    }
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0].tabs.map((t) => t.id).sort()).toEqual([1, 2]);
    await ctl.confirmWrapup([]);
    const apply = bridge.sent.find((s) => s.type === 'cmd.wrapup.apply')!.payload as { groups: { tabIds: number[] }[] };
    expect(apply.groups).toHaveLength(1);
    expect(apply.groups[0].tabIds.sort()).toEqual([1, 2]);
  });

  it('needs a draft first', async () => {
    const { ctl } = await setup();
    expect(await ctl.editWrapup({ op: 'move', tabId: 1, to: 'x' })).toEqual({ error: 'no_preview' });
  });
});

describe('SideController journey fixes', () => {
  afterEach(() => vi.useRealTimers());

  it('an excluded site added while the Wrap up preview is open does not break confirm', async () => {
    const { ctl, store, bridge } = await setup();
    const pv = await ctl.previewWrapup();
    if ('error' in pv) throw new Error('not connected');
    expect(pv.groups.flatMap((g) => g.tabs.map((t) => t.id))).toContain(2);
    await ctl.updateSettings({ excludedDomains: ['github.com'] });
    const out = await ctl.confirmWrapup([]);
    expect(out.kind).toBe('applied');
    const apply = bridge.sent.find((s) => s.type === 'cmd.wrapup.apply');
    expect(JSON.stringify(apply?.payload)).not.toContain('github.com');
    expect(store.get().setAsides).toHaveLength(1);
  });

  it('forgets the paired extension so the next one that connects is paired', async () => {
    const { ctl, store } = await setup();
    await store.update((d) => ({ ...d, pairedOrigin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }));
    expect(await ctl.resetPairing()).toEqual({ ok: true });
    expect(store.get().pairedOrigin).toBeNull();
  });

  it('keeps the quiet hours that were set when a new window would start and end at the same time', async () => {
    const { ctl } = await setup();
    await ctl.updateSettings({ quietHours: { start: 22 * 60, end: 8 * 60 } });
    const out = await ctl.updateSettings({ quietHours: { start: 8 * 60, end: 8 * 60 } });
    expect(out.quietHours).toEqual({ start: 22 * 60, end: 8 * 60 });
  });

  it('greets an empty Chrome once: marks the greeting done and never sends titles to Claude', async () => {
    const llm = vi.fn(async () => '{}');
    const empty: TabsReport = { ...report, tabs: [tab(3, 'https://news.ycombinator.com/', { active: true })] };
    const { ctl, store, bubbles } = await setup({ llm, report: empty });
    await ctl.greetFirstRun();
    expect(store.get().firstRunDone).toBe(true);
    expect(bubbles).toEqual([]);
    expect(llm).not.toHaveBeenCalled();
  });

  it('greets with a count from the rules alone, without Claude', async () => {
    const llm = vi.fn(async () => '{}');
    const { ctl, bubbles } = await setup({ llm });
    await ctl.greetFirstRun();
    expect(bubbles[0]).toMatchObject({ kind: 'first_run', tabs: 2 });
    expect(llm).not.toHaveBeenCalled();
    // A real Wrap up preview still uses Claude.
    await ctl.previewWrapup();
    expect(llm).toHaveBeenCalled();
  });

  it('asks Chrome for a fresh report about 10.5 and 13 minutes after a step opens, only while still unjudged', async () => {
    const { ctl, bridge } = await setup();
    await ctl.previewWrapup();
    await ctl.confirmWrapup([]);
    const stepId = ctl.step.current()!.id;
    vi.useFakeTimers();
    const requests = () => bridge.sent.filter((s) => s.type === 'tabs.request').length;
    const out = await ctl.openStep(stepId);
    expect(out.kind).toBe('opened');
    const before = requests();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(requests()).toBe(before);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(requests()).toBe(before + 1);
    await vi.advanceTimersByTimeAsync(3 * 60_000);
    expect(requests()).toBe(before + 2);
  });

  it('does not ask again at 13 minutes when the step was already judged', async () => {
    const { ctl, bridge, store } = await setup();
    await ctl.previewWrapup();
    await ctl.confirmWrapup([]);
    const stepId = ctl.step.current()!.id;
    vi.useFakeTimers();
    await ctl.openStep(stepId);
    const before = bridge.sent.filter((s) => s.type === 'tabs.request').length;
    await vi.advanceTimersByTimeAsync(10.5 * 60_000 + 1000);
    await store.update((d) => ({ ...d, stepEvents: d.stepEvents.map((e) => ({ ...e, stillWorkingAt10m: true })) }));
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    expect(bridge.sent.filter((s) => s.type === 'tabs.request').length).toBe(before + 1);
  });
});
