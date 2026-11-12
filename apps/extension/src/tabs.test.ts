import { buildReport, snapshotTabs, loadExclusions, saveExclusions, createDebouncer } from './tabs';
import { createFakeChrome, makeTab } from './testing/fakeChrome';
import type { ChromeApi } from './api';
import type { PagePosition } from '@side/shared';

const pos: PagePosition = { scroller: 'window', selector: null, top: 900, ratio: 0.3, quote: 'Retries back off', capturedAt: 5 };

describe('buildReport', () => {
  const tabs = [
    makeTab(1, 'https://docs.google.com/document/d/a/edit', { title: 'Retry design', active: true }),
    makeTab(2, 'https://app.client-bank.com/accounts', { title: 'ACME Corp balance sheet' }),
    makeTab(3, 'https://client-bank.com/', { title: 'Client bank login' }),
    makeTab(4, 'chrome://extensions/', { title: 'Extensions' }),
    makeTab(5, 'https://github.com/side/side', { incognito: true, title: 'Secret repo' }),
    makeTab(6, 'https://github.com/side/side/pull/3', { title: 'PR 3', groupId: 77, pinned: true, audible: true }),
  ];

  it('never includes tabs from excluded domains, and counts them by entry', () => {
    const r = buildReport(tabs, ['client-bank.com'], new Map(), new Map(), 10);
    expect(r.tabs.map((t) => t.tabId)).toEqual([1, 6]);
    expect(JSON.stringify(r)).not.toContain('client-bank.com/');
    expect(JSON.stringify(r)).not.toContain('ACME');
    expect(r.skipped.excluded).toBe(2);
    expect(r.skipped.excludedByDomain).toEqual({ 'client-bank.com': 2 });
  });

  it('skips incognito and non-web pages by count only', () => {
    const r = buildReport(tabs, [], new Map(), new Map(), 10);
    expect(r.skipped.incognito).toBe(1);
    expect(r.skipped.internal).toBe(1);
    expect(r.tabs.some((t) => t.title === 'Secret repo')).toBe(false);
  });

  it('carries flags, group title and the last known position', () => {
    const r = buildReport(tabs, [], new Map([[1, pos]]), new Map([[77, 'My own group']]), 10);
    const one = r.tabs.find((t) => t.tabId === 1)!;
    expect(one.position).toEqual(pos);
    expect(one.active).toBe(true);
    const six = r.tabs.find((t) => t.tabId === 6)!;
    expect(six).toMatchObject({ groupId: 77, groupTitle: 'My own group', pinned: true, audible: true, position: null });
    expect(r.capturedAt).toBe(10);
  });
});

describe('snapshotTabs', () => {
  it('reads all tabs and group titles from Chrome', async () => {
    const fake = createFakeChrome([makeTab(1, 'https://github.com/a', { groupId: 9 }), makeTab(2, 'https://mail.google.com/x')]);
    fake.groups.set(9, { id: 9, collapsed: false, color: 'blue', title: 'Work', windowId: 1 });
    const r = await snapshotTabs(fake.chrome as unknown as ChromeApi, ['mail.google.com'], new Map(), 1);
    expect(r.tabs).toHaveLength(1);
    expect(r.tabs[0].groupTitle).toBe('Work');
    expect(r.skipped.excludedByDomain).toEqual({ 'mail.google.com': 1 });
  });
});

describe('exclusions storage', () => {
  it('normalizes and stores the list, dropping junk', async () => {
    const fake = createFakeChrome();
    const api = fake.chrome as unknown as ChromeApi;
    expect(await loadExclusions(api)).toEqual([]);
    await saveExclusions(api, ['https://www.Client-Bank.com/x', 'not a domain', 'mail.google.com', 'mail.google.com']);
    expect(await loadExclusions(api)).toEqual(['client-bank.com', 'mail.google.com']);
  });
});

describe('buildReport limits', () => {
  const big = (n: number) => 'x'.repeat(n);

  it('skips a tab with a URL over 8192 characters and counts it as internal', () => {
    const r = buildReport([makeTab(1, 'https://a.com/' + big(8200)), makeTab(2, 'https://a.com/ok')], [], new Map(), new Map(), 1);
    expect(r.tabs.map((t) => t.tabId)).toEqual([2]);
    expect(r.skipped.internal).toBe(1);
  });

  it('shortens titles and group titles to what the app accepts', () => {
    const r = buildReport([makeTab(1, 'https://a.com/', { title: big(3000), groupId: 5 })], [], new Map(), new Map([[5, big(900)]]), 1);
    expect(r.tabs[0].title).toHaveLength(2000);
    expect(r.tabs[0].groupTitle).toHaveLength(500);
  });

  it('drops a position with a too-long selector, and only the quote when the quote is too long', () => {
    const bad: PagePosition = { ...pos, scroller: 'element', selector: big(501) };
    const longQuote: PagePosition = { ...pos, quote: big(301) };
    const r = buildReport(
      [makeTab(1, 'https://a.com/1'), makeTab(2, 'https://a.com/2')],
      [],
      new Map([[1, bad], [2, longQuote]]),
      new Map(),
      1,
    );
    expect(r.tabs[0].position).toBeNull();
    expect(r.tabs[1].position).toEqual({ ...pos, quote: null });
  });

  it('reports at most 2000 tabs', () => {
    const tabs = Array.from({ length: 2005 }, (_, i) => makeTab(i + 1, `https://a.com/${i}`));
    expect(buildReport(tabs, [], new Map(), new Map(), 1).tabs).toHaveLength(2000);
  });
});

describe('createDebouncer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('runs once after a burst of events', () => {
    const fn = vi.fn();
    const d = createDebouncer(fn, 500);
    d();
    d();
    vi.advanceTimersByTime(499);
    d();
    vi.advanceTimersByTime(499);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
