// End to end without a screen: the real desktop bridge, controller and data file talk to the real
// extension worker logic over a real WebSocket. Only Chrome itself is faked.
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { Bridge } from '../../apps/desktop/src/main/bridge';
import { JsonStore } from '../../apps/desktop/src/main/store';
import { defaultAppData, type AppData } from '../../apps/desktop/src/main/appData';
import { SideController } from '../../apps/desktop/src/main/controller';
import { DemoClock } from '../../apps/desktop/src/core/clock';
import { startExtension } from '../../apps/extension/src/app';
import { createFakeChrome, makeTab } from '../../apps/extension/src/testing/fakeChrome';
import type { ChromeApi } from '../../apps/extension/src/api';
import type { SocketLike } from '../../apps/extension/src/bridge';

const ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 4000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting');
    await wait(20);
  }
}

class Ev {
  fns: ((...a: any[]) => void)[] = [];
  addListener(f: (...a: any[]) => void) {
    this.fns.push(f);
  }
}

function demoTabs() {
  const urls = [
    ...Array.from({ length: 8 }, (_, i) => `https://github.com/acme/retry-lib/issues/${i + 1}`),
    ...Array.from({ length: 6 }, (_, i) => `https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#s${i}`),
    ...Array.from({ length: 6 }, (_, i) => `https://en.wikipedia.org/wiki/Exponential_backoff?v=${i}`),
    'https://www.youtube.com/watch?v=lofi',
    'https://news.ycombinator.com/',
  ];
  const tabs = urls.map((u, i) => makeTab(i + 1, u, { title: `Page ${i + 1}`, lastAccessed: 1_000 + i }));
  tabs.push(makeTab(30, 'https://docs.google.com/document/d/pitch/edit', { title: 'Pitch notes', active: true }));
  tabs.push(makeTab(31, 'https://github.com/acme/side', { title: 'Pinned repo', pinned: true }));
  tabs.push(makeTab(32, 'https://www.youtube.com/watch?v=talk', { title: 'Playing talk', audible: true }));
  tabs.push(makeTab(33, 'https://client-bank.com/accounts/991', { title: 'Client 991 balance' }));
  return tabs;
}

async function boot() {
  const f = createFakeChrome(demoTabs());
  f.permit('https://github.com/*');
  f.onScript(() => ({ scroller: 'window', selector: null, top: 1200, ratio: 0.5, quote: null, capturedAt: 1 }));

  const path = join(mkdtempSync(join(tmpdir(), 'side-e2e-')), 'side-data.json');
  const store = new JsonStore<AppData>(path, defaultAppData);
  await store.load();
  let ctl!: SideController;
  const bridge = new Bridge({
    host: '127.0.0.1',
    port: 0,
    appVersion: 'test',
    timeoutMs: 4000,
    getPinnedOrigin: () => store.get().pairedOrigin,
    pinOrigin: (o) => store.update((d) => ({ ...d, pairedOrigin: o })).then(() => undefined),
    getExclusions: () => store.get().settings.excludedDomains,
    onReport: (r) => void ctl.onReport(r),
    onStatus: (s) => ctl?.onBridgeStatus(s),
  });
  const port = await bridge.start();
  ctl = new SideController({
    store, bridge, clock: new DemoClock(), llm: null, edge: null,
    registerShortcut: () => true, push: () => undefined, renderBubble: () => undefined, openMain: () => undefined,
  });

  const ext = startExtension({
    api: f.chrome as unknown as ChromeApi,
    tabEvents: f.chrome.tabs,
    groupEvents: { onUpdated: new Ev(), onRemoved: new Ev() },
    createSocket: () => new WebSocket(`ws://127.0.0.1:${port}`, { origin: ORIGIN }) as unknown as SocketLike,
    version: '0.1.0',
  });
  await until(() => bridge.status === 'connected' && ctl.lastReport !== null);
  return { f, store, bridge, ctl, ext, path };
}

describe('desktop <-> extension round trip', () => {
  let ctx: Awaited<ReturnType<typeof boot>>;
  afterEach(async () => {
    ctx?.ext.bridge.close?.();
    await ctx?.bridge.stop();
  });

  it('counts every Chrome tab, then folds 20+ real tabs, opens the step and undoes', async () => {
    ctx = await boot();
    const { f, ctl, store, path } = ctx;
    expect(ctl.state().numbers.tabsInChrome).toBe(f.tabs.size);

    await ctl.updateSettings({ excludedDomains: ['client-bank.com'] });
    await until(() => ctl.lastReport!.skipped.excluded === 1);
    expect(ctl.lastReport!.tabs.some((t) => t.url.includes('client-bank'))).toBe(false);
    expect(ctl.state().numbers.tabsInChrome).toBe(f.tabs.size);

    const preview = await ctl.previewWrapup();
    if ('error' in preview) throw new Error('not connected');
    expect(preview.foldCount).toBeGreaterThanOrEqual(20);
    expect(preview.kept.map((k) => k.reason).sort()).toEqual(['active', 'audible', 'pinned']);

    const out = await ctl.confirmWrapup([]);
    expect(out.kind).toBe('applied');
    const titles = [...f.groups.values()].map((g) => g.title);
    expect(titles.length).toBeGreaterThanOrEqual(2);
    expect(new Set(titles).size).toBe(titles.length);
    expect([...f.groups.values()].every((g) => g.collapsed)).toBe(true);
    expect(f.tabs.size).toBe(demoTabs().length);
    for (const id of [30, 31, 32, 33]) expect(f.tabs.get(id)!.groupId).toBe(-1);

    const file = readFileSync(path, 'utf8');
    expect(file).not.toContain('client-bank.com/accounts');
    expect(file).not.toContain('Client 991');

    const step = ctl.step.current();
    expect(step).not.toBeNull();
    const opened = await ctl.step.open(step!.id);
    expect(opened.kind).toBe('opened');

    const id = store.get().setAsides[0].id;
    const undo = await ctl.wrapup.undo(id);
    expect(undo.kind).toBe('undone');
    await until(() => [...f.tabs.values()].every((t) => t.groupId === -1));
    expect(f.tabs.size).toBeGreaterThanOrEqual(demoTabs().length);
  });

  it('closes only the confirmed group and brings those tabs back once on Undo', async () => {
    ctx = await boot();
    const { f, ctl, store } = ctx;
    const before = f.tabs.size;
    const preview = await ctl.previewWrapup();
    if ('error' in preview) throw new Error('not connected');
    const target = preview.groups[0];
    const out = await ctl.confirmWrapup([target.key]);
    expect(out.kind).toBe('applied');
    expect(f.tabs.size).toBe(before - target.tabs.length);
    const id = store.get().setAsides[0].id;
    await ctl.wrapup.undo(id);
    await ctl.wrapup.undo(id);
    expect(f.tabs.size).toBe(before);
  });
});
