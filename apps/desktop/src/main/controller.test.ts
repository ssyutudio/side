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
