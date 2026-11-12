import { capturePositionInPage, restorePositionInPage, quoteInViewInPage, pageKey, PositionTracker } from './position';
import { el, fakeWindow } from './testing/fakeDom';
import { createFakeChrome, makeTab } from './testing/fakeChrome';
import type { ChromeApi } from './api';
import type { PagePosition } from '@side/shared';

describe('capturePositionInPage', () => {
  it('uses the window when the page itself scrolled', () => {
    const p = el('p', { textContent: 'Retries back off exponentially after each failure. Then more.', rect: { top: 40, bottom: 80 } });
    const { win } = fakeWindow([p], { rootScrollHeight: 3800, rootScrollTop: 1500 });
    const pos = capturePositionInPage(win)!;
    expect(pos.scroller).toBe('window');
    expect(pos.selector).toBeNull();
    expect(pos.top).toBe(1500);
    expect(pos.ratio).toBeCloseTo(1500 / 3000);
    expect(pos.quote).toBe('Retries back off exponentially after each failure.');
  });

  it('finds the inner element that actually scrolled (Docs-style), with window scrollY at 0', () => {
    const editor = el('div', { className: 'kix-appview-editor', scrollHeight: 10_000, clientHeight: 700, scrollTop: 4200 });
    const other = el('div', { className: 'sidebar', scrollHeight: 900, clientHeight: 700, scrollTop: 30 });
    const { win } = fakeWindow([el('div', {}, [editor]), other]);
    const pos = capturePositionInPage(win)!;
    expect(pos.scroller).toBe('element');
    expect(pos.selector).toBe('.kix-appview-editor');
    expect(pos.top).toBe(4200);
    expect(pos.ratio).toBeCloseTo(4200 / 9300);
    expect(pos.quote).toBeNull();
  });

  it('builds a path selector when no id or unique class exists', () => {
    const scroller = el('main', { className: 'scroll', scrollHeight: 5000, clientHeight: 500, scrollTop: 800 });
    const twin = el('section', { className: 'scroll' });
    const { win, doc } = fakeWindow([el('div', {}, [twin]), el('div', {}, [scroller])]);
    const pos = capturePositionInPage(win)!;
    expect(doc.querySelectorAll(pos.selector!)).toEqual([scroller]);
  });

  it('prefers an id when the scroller has one', () => {
    const s = el('div', { id: 'notion-scroller', scrollHeight: 5000, clientHeight: 500, scrollTop: 10 });
    const { win } = fakeWindow([s]);
    expect(capturePositionInPage(win)!.selector).toBe('#notion-scroller');
  });

  it('cuts a long visible sentence at a word boundary within 120 characters', () => {
    const long = 'word '.repeat(60).trim();
    const p = el('p', { textContent: long, rect: { top: 10, bottom: 300 } });
    const { win } = fakeWindow([p], { rootScrollHeight: 2000, rootScrollTop: 10 });
    const q = capturePositionInPage(win)!.quote!;
    expect(q.length).toBeLessThanOrEqual(120);
    expect(long.startsWith(q)).toBe(true);
    expect(q.endsWith(' ')).toBe(false);
  });
});

describe('pageKey', () => {
  it('drops plain fragments and text directives but keeps hash routes', () => {
    expect(pageKey('https://a.com/p#install')).toBe('https://a.com/p');
    expect(pageKey('https://a.com/p#:~:text=x')).toBe('https://a.com/p');
    expect(pageKey('https://a.com/#/doc/5')).toBe('https://a.com/#/doc/5');
    expect(pageKey('https://a.com/#/doc/5:~:text=x')).toBe('https://a.com/#/doc/5');
    expect(pageKey('https://a.com/#!/x')).toBe('https://a.com/#!/x');
    expect(pageKey('https://a.com/#/doc/5')).not.toBe(pageKey('https://a.com/#/doc/6'));
  });

  it('keeps hash-routed pages apart in the position tracker', async () => {
    const pos: PagePosition = { scroller: 'window', selector: null, top: 10, ratio: 0.1, quote: null, capturedAt: 1 };
    const fake = createFakeChrome([makeTab(1, 'https://github.com/app#/doc/5')]);
    fake.permit('https://github.com/*');
    fake.onScript(() => pos);
    const t = new PositionTracker(fake.chrome as unknown as ChromeApi, { timeoutMs: 50 });
    await t.capture(fake.tabs.get(1)!);
    expect(t.matching([makeTab(1, 'https://github.com/app#/doc/5')]).size).toBe(1);
    expect(t.matching([makeTab(1, 'https://github.com/app#/doc/6')]).size).toBe(0);
  });
});

describe('quoteInViewInPage', () => {
  // A page of text nodes; each node lists its on-screen box.
  function page(nodes: { data: string; top: number; bottom: number }[]) {
    const text = nodes.map((n) => ({ data: n.data, box: n }));
    let i = 0;
    const doc = {
      body: {},
      createTreeWalker: () => ({ nextNode: () => text[i++] ?? null }),
      createRange: () => {
        const r: any = {
          setStart: (n: any) => (r.a = n),
          setEnd: (n: any) => (r.b = n),
          getBoundingClientRect: () => ({ top: r.a.box.top, bottom: r.b.box.bottom }),
        };
        return r;
      },
    };
    return { document: doc, innerHeight: 800 };
  }

  it('finds a sentence across nodes and odd whitespace when it is on screen', async () => {
    const w = page([{ data: 'Intro. Retries  back', top: 100, bottom: 120 }, { data: ' off\n- then give up.', top: 120, bottom: 140 }]);
    expect(await quoteInViewInPage('retries back off - then give up', 0, w)).toBe(true);
  });

  it('says no when the sentence is missing or off screen', async () => {
    expect(await quoteInViewInPage('not here', 0, page([{ data: 'Something else', top: 10, bottom: 20 }]))).toBe(false);
    expect(await quoteInViewInPage('far away', 0, page([{ data: 'far away', top: 5000, bottom: 5020 }]))).toBe(false);
  });
});

describe('restorePositionInPage', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const elementPos: PagePosition = { scroller: 'element', selector: '.kix-appview-editor', top: 4200, ratio: 0.45, quote: null, capturedAt: 1 };

  it('scrolls the inner element to the saved offset', async () => {
    const editor = el('div', { className: 'kix-appview-editor', scrollHeight: 10_000, clientHeight: 700 });
    const { win } = fakeWindow([editor]);
    const r = restorePositionInPage(elementPos, 3000, win);
    await vi.runAllTimersAsync();
    expect(await r).toBe('exact');
    expect(editor.scrollTop).toBe(4200);
  });

  it('keeps retrying while the page is still loading', async () => {
    const editor = el('div', { className: 'kix-appview-editor', scrollHeight: 1000, clientHeight: 700 });
    const { win } = fakeWindow([editor]);
    const r = restorePositionInPage(elementPos, 5000, win);
    await vi.advanceTimersByTimeAsync(1000);
    editor.scrollHeight = 10_000;
    await vi.advanceTimersByTimeAsync(1000);
    expect(await r).toBe('exact');
    expect(editor.scrollTop).toBe(4200);
  });

  it('says none when the spot cannot be reached in time', async () => {
    const { win } = fakeWindow([el('div')]);
    const r = restorePositionInPage(elementPos, 1000, win);
    await vi.runAllTimersAsync();
    expect(await r).toBe('none');
  });

  it('scrolls the window for window positions', async () => {
    const { win, root } = fakeWindow([], { rootScrollHeight: 4000 });
    const r = restorePositionInPage({ scroller: 'window', selector: null, top: 1200, ratio: 0.37, quote: null, capturedAt: 1 }, 1000, win);
    await vi.runAllTimersAsync();
    expect(await r).toBe('exact');
    expect(root.scrollTop).toBe(1200);
  });
});

describe('PositionTracker', () => {
  const pos: PagePosition = { scroller: 'window', selector: null, top: 700, ratio: 0.2, quote: null, capturedAt: 1 };

  it('captures only on sites Side has permission for', async () => {
    const fake = createFakeChrome([makeTab(1, 'https://docs.google.com/document/d/a'), makeTab(2, 'https://www.youtube.com/watch?v=x')]);
    fake.permit('https://docs.google.com/*');
    fake.onScript(() => pos);
    const t = new PositionTracker(fake.chrome as unknown as ChromeApi, { timeoutMs: 500 });
    expect(await t.capture(fake.tabs.get(1)!)).toEqual(pos);
    expect(await t.capture(fake.tabs.get(2)!)).toBeNull();
    expect(fake.calls.filter((c) => c === 'scripting.executeScript')).toHaveLength(1);
    expect(t.positions.get(1)).toEqual(pos);
  });

  it('gives up after the timeout and keeps the last known position', async () => {
    const fake = createFakeChrome([makeTab(1, 'https://github.com/a')]);
    fake.permit('https://github.com/*');
    fake.onScript(() => pos);
    const t = new PositionTracker(fake.chrome as unknown as ChromeApi, { timeoutMs: 50 });
    await t.capture(fake.tabs.get(1)!);
    fake.onScript(() => new Promise(() => {}));
    expect(await t.capture(fake.tabs.get(1)!)).toBeNull();
    expect(t.positions.get(1)).toEqual(pos);
  });

  it('ignores malformed results from the page', async () => {
    const fake = createFakeChrome([makeTab(1, 'https://github.com/a')]);
    fake.permit('https://github.com/*');
    fake.onScript(() => ({ scroller: 'window', top: 'lots' }));
    const t = new PositionTracker(fake.chrome as unknown as ChromeApi, { timeoutMs: 50 });
    expect(await t.capture(fake.tabs.get(1)!)).toBeNull();
  });

  it('hands out a position only while the tab still shows the page it was captured on', async () => {
    const fake = createFakeChrome([makeTab(1, 'https://github.com/a#readme')]);
    fake.permit('https://github.com/*');
    fake.onScript(() => pos);
    const t = new PositionTracker(fake.chrome as unknown as ChromeApi, { timeoutMs: 50 });
    await t.capture(fake.tabs.get(1)!);
    expect(t.matching([makeTab(1, 'https://github.com/a#install')]).get(1)).toEqual(pos);
    expect(t.matching([makeTab(1, 'https://github.com/b')]).size).toBe(0);
  });

  it('persists positions so a sleeping worker keeps them, and forgets closed tabs', async () => {
    const fake = createFakeChrome([makeTab(1, 'https://github.com/a')]);
    fake.permit('https://github.com/*');
    fake.onScript(() => pos);
    const api = fake.chrome as unknown as ChromeApi;
    const a = new PositionTracker(api, { timeoutMs: 50 });
    await a.capture(fake.tabs.get(1)!);
    const b = new PositionTracker(api, { timeoutMs: 50 });
    await b.load();
    expect(b.positions.get(1)).toEqual(pos);
    await b.forget(1);
    const c = new PositionTracker(api, { timeoutMs: 50 });
    await c.load();
    expect(c.positions.size).toBe(0);
  });
});
