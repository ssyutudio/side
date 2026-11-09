import { openStep, textFragmentUrl } from './restore';
import { RejectedError } from './journal';
import { createFakeChrome, makeTab } from './testing/fakeChrome';
import type { FakeChrome } from './testing/fakeChrome';
import type { ChromeApi } from './api';
import type { PagePosition } from '@side/shared';

const DOC = 'https://docs.google.com/document/d/abc/edit';
const pos: PagePosition = { scroller: 'element', selector: '.kix-appview-editor', top: 4200, ratio: 0.45, quote: 'Retries back off - then give up, eventually.', capturedAt: 1 };
const api = (f: FakeChrome) => f.chrome as unknown as ChromeApi;
const opts = { loadTimeoutMs: 3000, restoreWaitMs: 2000 };

describe('openStep', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function run(f: FakeChrome, p: Parameters<typeof openStep>[1]) {
    const r = openStep(api(f), p, opts);
    await vi.runAllTimersAsync();
    return r;
  }

  it('brings an existing tab with that page to the front instead of opening another', async () => {
    const f = createFakeChrome([makeTab(1, 'https://youtube.com/watch?v=x', { active: true }), makeTab(2, DOC + '#heading=h.1')]);
    f.permit('https://docs.google.com/*');
    f.onScript(() => 'exact');
    const r = await run(f, { stepId: 's1', url: DOC, position: pos });
    expect(r).toEqual({ tabId: 2, restored: 'exact' });
    expect(f.tabs.size).toBe(2);
    expect(f.tabs.get(2)!.active).toBe(true);
    expect(f.calls).toContain('windows.update');
  });

  it('opens the page when no tab shows it, and waits for it to load before scrolling', async () => {
    const f = createFakeChrome([makeTab(1, 'https://youtube.com/watch?v=x', { active: true })]);
    f.permit('https://docs.google.com/*');
    const statusAtScript: string[] = [];
    f.onScript((tabId, args) => {
      statusAtScript.push(f.tabs.get(tabId)!.status!);
      expect(args).toEqual([pos, opts.restoreWaitMs]);
      return 'exact';
    });
    const origCreate = f.chrome.tabs.create;
    f.chrome.tabs.create = async (p) => {
      const t = await origCreate(p);
      f.tabs.get(t.id!)!.status = 'loading';
      setTimeout(() => (f.tabs.get(t.id!)!.status = 'complete'), 1000);
      return t;
    };
    const r = await run(f, { stepId: 's1', url: DOC, position: pos });
    expect(r.restored).toBe('exact');
    expect(statusAtScript).toEqual(['complete']);
    expect([...f.tabs.values()].filter((t) => t.url === DOC)).toHaveLength(1);
  });

  it('falls back to a text link to the saved sentence when the offset cannot be reached', async () => {
    const f = createFakeChrome([makeTab(2, DOC)]);
    f.permit('https://docs.google.com/*');
    f.onScript(() => 'none');
    const r = await run(f, { stepId: 's1', url: DOC, position: pos });
    expect(r.restored).toBe('text');
    expect(f.tabs.get(2)!.url).toBe(textFragmentUrl(DOC, pos.quote!));
  });

  it('says top when it has no permission and no sentence, without injecting anything', async () => {
    const f = createFakeChrome([]);
    const r = await run(f, { stepId: 's1', url: 'https://example.com/a', position: { ...pos, quote: null } });
    expect(r.restored).toBe('top');
    expect(f.calls).not.toContain('scripting.executeScript');
  });

  it('says top when there is no saved position', async () => {
    const f = createFakeChrome([]);
    f.permit('https://docs.google.com/*');
    const r = await run(f, { stepId: 's1', url: DOC, position: null });
    expect(r.restored).toBe('top');
  });

  it('never opens anything that is not a web page', async () => {
    const f = createFakeChrome([]);
    for (const url of ['javascript:alert(1)', 'chrome://settings', 'file:///etc/passwd']) {
      await expect(openStep(api(f), { stepId: 's', url, position: null }, opts)).rejects.toBeInstanceOf(RejectedError);
    }
    expect(f.calls).not.toContain('tabs.create');
  });
});

describe('textFragmentUrl', () => {
  it('drops any old hash and escapes the characters text fragments reserve', () => {
    expect(textFragmentUrl('https://a.com/p#old', 'a-b, c & d')).toBe('https://a.com/p#:~:text=a%2Db%2C%20c%20%26%20d');
  });
});
