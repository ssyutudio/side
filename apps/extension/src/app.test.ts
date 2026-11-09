import { startExtension } from './app';
import { FakeSocket } from './testing/fakeSocket';
import { createFakeChrome, makeTab } from './testing/fakeChrome';
import type { ChromeApi } from './api';
import { makeMessage, encodeMessage, RECONNECT_MIN_MS } from '@side/shared';
import type { PagePosition } from '@side/shared';

class Ev {
  fns: ((...a: any[]) => void)[] = [];
  addListener(f: (...a: any[]) => void) {
    this.fns.push(f);
  }
  fire(...a: any[]) {
    this.fns.forEach((f) => f(...a));
  }
}

const pos: PagePosition = { scroller: 'window', selector: null, top: 640, ratio: 0.2, quote: null, capturedAt: 1 };

function boot() {
  const f = createFakeChrome([
    makeTab(1, 'https://github.com/o/r', { active: true }),
    makeTab(2, 'https://docs.google.com/document/d/a/edit'),
    makeTab(3, 'https://client-bank.com/x'),
  ]);
  f.permit('https://docs.google.com/*');
  f.permit('https://github.com/*');
  f.onScript(() => pos);
  const sockets: FakeSocket[] = [];
  const groupEvents = { onUpdated: new Ev(), onRemoved: new Ev() };
  const alarms = { created: [] as string[], onAlarm: new Ev(), create(name: string) { this.created.push(name); } };
  const ext = startExtension({
    api: f.chrome as unknown as ChromeApi,
    tabEvents: f.chrome.tabs,
    groupEvents,
    alarms,
    createSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    version: '0.1.0',
  });
  const sock = () => sockets[sockets.length - 1];
  const reports = () => sock().sent.map((s) => JSON.parse(s)).filter((m) => m.type === 'tabs.report');
  return { f, ext, sockets, sock, reports, alarms, groupEvents };
}

describe('startExtension', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('connects, says hello and reports tabs when the app welcomes it', async () => {
    const { ext, sock, reports } = boot();
    await ext.ready;
    sock().open();
    expect(sock().sentTypes()[0]).toBe('hello');
    sock().receive(encodeMessage(makeMessage('welcome', { appVersion: '0.1.0' })));
    await vi.advanceTimersByTimeAsync(10);
    expect(reports().at(-1).payload.tabs).toHaveLength(3);
  });

  it('stores the exclusion list from the app and drops those tabs from the next report', async () => {
    const { ext, sock, reports, f } = boot();
    await ext.ready;
    sock().open();
    sock().receive(encodeMessage(makeMessage('exclusions.set', { domains: ['client-bank.com'] })));
    await vi.advanceTimersByTimeAsync(10);
    const last = reports().at(-1).payload;
    expect(last.tabs.map((t: any) => t.tabId)).toEqual([1, 2]);
    expect(last.skipped.excluded).toBe(1);
    expect(JSON.stringify(f.store)).toContain('client-bank.com');
  });

  it('follows Chrome: closing a tab sends a new report after a short pause', async () => {
    const { ext, sock, reports, f } = boot();
    await ext.ready;
    sock().open();
    await vi.advanceTimersByTimeAsync(600);
    const before = reports().length;
    await f.chrome.tabs.remove([2]);
    await vi.advanceTimersByTimeAsync(600);
    expect(reports().length).toBe(before + 1);
    expect(reports().at(-1).payload.tabs).toHaveLength(2);
  });

  it('captures where the user was on the tab they leave', async () => {
    const { ext, sock, reports, f } = boot();
    await ext.ready;
    sock().open();
    f.tabs.get(1)!.active = false;
    f.tabs.get(2)!.active = true;
    f.events.onActivated.fire({ tabId: 2, windowId: 1 });
    await vi.advanceTimersByTimeAsync(600);
    const t1 = reports().at(-1).payload.tabs.find((t: any) => t.tabId === 1);
    expect(t1.position).toEqual(pos);
  });

  it('captures the active tabs before answering tabs.request', async () => {
    const { ext, sock, reports } = boot();
    await ext.ready;
    sock().open();
    sock().receive(encodeMessage(makeMessage('tabs.request', {})));
    await vi.advanceTimersByTimeAsync(10);
    expect(reports().at(-1).payload.tabs.find((t: any) => t.tabId === 1).position).toEqual(pos);
  });

  it('answers commands with replyTo, and ignores garbage frames', async () => {
    const { ext, sock } = boot();
    await ext.ready;
    sock().open();
    sock().receive('{"nope');
    sock().receive(null);
    const cmd = makeMessage('cmd.wrapup.apply', {
      setAsideId: 'sa',
      groups: [{ key: 'k', name: 'Docs', tabIds: [2] }],
      closeTabIds: [],
      expectUrls: { '2': 'https://docs.google.com/document/d/a/edit' },
    });
    sock().receive(encodeMessage(cmd));
    await vi.advanceTimersByTimeAsync(10);
    const reply = sock().sent.map((s) => JSON.parse(s)).find((m) => m.type === 'cmd.result');
    expect(reply).toMatchObject({ replyTo: cmd.id, payload: { ok: true } });
  });

  it('registers a keepalive alarm that reconnects a sleeping worker', async () => {
    const { ext, sockets, sock, alarms } = boot();
    await ext.ready;
    expect(alarms.created).toContain('side-keepalive');
    sock().drop();
    ext.bridge.close();
    alarms.onAlarm.fire({ name: 'side-keepalive' });
    expect(sockets.length).toBe(2);
    await vi.advanceTimersByTimeAsync(RECONNECT_MIN_MS);
  });
});
