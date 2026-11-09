import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TabSnapshot, TabsReport } from '@side/shared';
import { JsonStore } from './store';
import { defaultAppData, type AppData } from './appData';
import { SideController, type BridgePort } from './controller';
import type { BridgeStatus, CommandOutcome } from './bridge';
import { DemoClock, fixedClock } from '../core/clock';

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

async function setup() {
  const store = new JsonStore<AppData>(join(mkdtempSync(join(tmpdir(), 'side-ctl-')), 'd.json'), defaultAppData);
  await store.load();
  const bridge = new FakeBridge();
  const resized: string[] = [];
  const shortcuts: string[] = [];
  const bubbles: unknown[] = [];
  const clock = new DemoClock(fixedClock(REAL));
  const ctl = new SideController({
    store, bridge, clock, llm: null,
    edge: { resize: (s) => resized.push(s), show: () => undefined, hide: () => undefined },
    registerShortcut: (a) => { shortcuts.push(a); return a !== 'Taken+Key'; },
    push: () => undefined,
    renderBubble: (b) => bubbles.push(b),
    openMain: () => undefined,
    realNow: () => REAL,
  });
  bridge.onRequest = () => setTimeout(() => void ctl.onReport(report), 5);
  return { store, bridge, ctl, resized, shortcuts, bubbles, clock };
}

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

  it('records a spoken bubble and a shown step only after the screen drew it', async () => {
    const { ctl, store } = await setup();
    await ctl.previewWrapup();
    await ctl.confirmWrapup([]);
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
    expect(steps[0].action.url).toBe('https://github.com/acme/retry-lib/issues/2');
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
