import { startExtension } from './app';
import { FakeSocket } from './testing/fakeSocket';
import { createFakeChrome, makeTab } from './testing/fakeChrome';
import { openStep } from './restore';
import type { ChromeApi } from './api';
import { makeMessage, encodeMessage } from '@side/shared';
import type { PagePosition } from '@side/shared';
import { COPY } from './copy';
import { KO } from './i18n/ko';
import { LANG_KEY, language, resetLanguage, say, setLanguage } from './lang';

const DOC = 'https://docs.google.com/document/d/abc/edit';
const pos: PagePosition = { scroller: 'window', selector: null, top: 640, ratio: 0.2, quote: null, capturedAt: 1 };

function boot() {
  const f = createFakeChrome([makeTab(1, DOC, { active: true })]);
  f.permit('https://docs.google.com/*');
  f.onScript(() => pos);
  const sockets: FakeSocket[] = [];
  const noop = { addListener() {} };
  const ext = startExtension({
    api: f.chrome as unknown as ChromeApi,
    tabEvents: f.chrome.tabs,
    createSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    version: '0.1.0',
    alarms: { create() {}, onAlarm: noop },
  });
  return { f, ext, sock: () => sockets[sockets.length - 1] };
}

const undoUnknown = () => makeMessage('cmd.wrapup.undo', { setAsideId: 'nope' });
const errorOf = (sock: FakeSocket) => sock.sent.map((s) => JSON.parse(s)).find((m) => m.type === 'cmd.result')?.payload.error.message;

describe('language', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetLanguage();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetLanguage();
  });

  it('is English by default, byte for byte', async () => {
    const { ext, sock } = boot();
    await ext.ready;
    sock().open();
    sock().receive(encodeMessage(undoUnknown()));
    await vi.advanceTimersByTimeAsync(10);
    expect(errorOf(sock())).toBe('There is nothing to undo for this set-aside.');
    expect(COPY.chromeFailed('x')).toBe('Chrome did not finish the change. (x)');
    expect(COPY.tabInTwoWorks(7)).toBe('Tab 7 was placed in two works.');
  });

  it('stores lang.set and uses it for a COPY error', async () => {
    const { f, ext, sock } = boot();
    await ext.ready;
    sock().open();
    sock().receive(encodeMessage(makeMessage('lang.set', { lang: 'ko' })));
    await vi.advanceTimersByTimeAsync(10);
    expect((await f.chrome.storage.local.get(LANG_KEY))[LANG_KEY]).toBe('ko');
    sock().receive(encodeMessage(undoUnknown()));
    await vi.advanceTimersByTimeAsync(10);
    expect(errorOf(sock())).toBe(KO['There is nothing to undo for this set-aside.']);
    expect(COPY.tabInTwoWorks(7)).toBe(KO['Tab {id} was placed in two works.'].replace('{id}', '7'));
  });

  it('reads the stored language when the worker wakes up', async () => {
    const { f, ext } = boot();
    await f.chrome.storage.local.set({ [LANG_KEY]: 'ko' });
    const woken = startExtension({
      api: f.chrome as unknown as ChromeApi,
      tabEvents: f.chrome.tabs,
      createSocket: () => new FakeSocket('ws://x'),
      version: '0.1.0',
    });
    await woken.ready;
    await ext.ready;
    expect(language()).toBe('ko');
    expect(say('Nothing to set aside.')).toBe(KO['Nothing to set aside.']);
  });

  it('puts the translated words on the page marker, and keeps English when English', async () => {
    const marks: unknown[][] = [];
    const run = async (lang: 'en' | 'ko') => {
      setLanguage(lang);
      const f = createFakeChrome([makeTab(2, DOC)]);
      f.permit('https://docs.google.com/*');
      f.onScript((_t, args, fn) => {
        if (fn === 'showStoppedMarkerInPage') marks.push(args);
        return fn === 'showStoppedMarkerInPage' ? true : 'exact';
      });
      const r = openStep(f.chrome as unknown as ChromeApi, { stepId: 's', url: DOC, position: { ...pos, scroller: 'element', selector: '.x' } }, { loadTimeoutMs: 3000, restoreWaitMs: 2000 });
      await vi.runAllTimersAsync();
      await r;
    };
    await run('en');
    await run('ko');
    expect((marks[0][1] as { text?: string }).text).toBeUndefined();
    expect((marks[1][1] as { text?: string }).text).toBe(KO['You stopped here']);
  });
});
