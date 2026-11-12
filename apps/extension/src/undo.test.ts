import { applyWrapup } from './wrapup';
import { undoWrapup } from './undo';
import { ChromeError, StorageError, RejectedError } from './journal';
import { createFakeChrome, makeTab } from './testing/fakeChrome';
import type { FakeChrome } from './testing/fakeChrome';
import type { ChromeApi } from './api';
import type { WrapupApplyPayload } from '@side/shared';

const U = (n: number) => `https://developer.mozilla.org/docs/page-${n}`;
const api = (f: FakeChrome) => f.chrome as unknown as ChromeApi;

async function wrapped() {
  const f = createFakeChrome([
    makeTab(1, U(1), { active: true }),
    ...[2, 3, 4, 5, 6].map((i) => makeTab(i, U(i), { index: i - 1 })),
    makeTab(7, U(7), { windowId: 2 }),
    makeTab(9, 'https://en.wikipedia.org/wiki/Backoff', { windowId: 2, index: 1, active: true }),
    makeTab(8, 'https://news.ycombinator.com/', { groupId: 90 }),
  ]);
  f.groups.set(90, { id: 90, collapsed: true, color: 'red', title: 'Mine', windowId: 1 });
  const p: WrapupApplyPayload = {
    setAsideId: 'sa-1',
    groups: [
      { key: 'a', name: 'Reading', tabIds: [2, 3, 4] },
      { key: 'b', name: 'Refs', tabIds: [5, 6, 7] },
    ],
    closeTabIds: [2, 3, 5, 7],
    expectUrls: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((i) => [String(i), U(i)])),
  };
  await applyWrapup(api(f), p, [], 1);
  return f;
}

const countUrl = (f: FakeChrome, url: string) => [...f.tabs.values()].filter((t) => t.url === url).length;
const closedUrls = [U(2), U(3), U(5), U(7)];

describe('undoWrapup', () => {
  it('ungroups Side groups and reopens every closed tab once, leaving user groups alone', async () => {
    const f = await wrapped();
    expect(closedUrls.map((u) => countUrl(f, u))).toEqual([0, 0, 0, 0]);
    const r = await undoWrapup(api(f), 'sa-1');
    expect(closedUrls.map((u) => countUrl(f, u))).toEqual([1, 1, 1, 1]);
    expect(r.reopened).toBe(4);
    expect(r.ungrouped.sort()).toEqual([4, 6]);
    expect(f.tabs.get(4)!.groupId).toBe(-1);
    expect(f.tabs.get(8)!.groupId).toBe(90);
    expect([...f.groups.values()].map((g) => g.title)).toEqual(['Mine']);
  });

  it('reopens a tab in the window it came from, without stealing focus', async () => {
    const f = await wrapped();
    await undoWrapup(api(f), 'sa-1');
    const seven = [...f.tabs.values()].find((t) => t.url === U(7))!;
    expect(seven.windowId).toBe(2);
    expect(seven.active).toBe(false);
  });

  it('reopens into another window when the original window is gone', async () => {
    const f = await wrapped();
    await f.chrome.tabs.remove([9]);
    await undoWrapup(api(f), 'sa-1');
    expect(countUrl(f, U(7))).toBe(1);
    expect([...f.tabs.values()].find((t) => t.url === U(7))!.windowId).toBe(1);
  });

  it.each([
    ['tabs.create', 3],
    ['tabs.create', 1],
    ['storage.set', 2],
    ['storage.set', 5],
    ['tabs.ungroup', 1],
  ] as [string, number][])('after a failure on %s #%i, a retry still reopens each tab exactly once', async (name, nth) => {
    const f = await wrapped();
    f.failOn(name, nth);
    const err = await undoWrapup(api(f), 'sa-1').then(
      () => null,
      (e) => e,
    );
    expect(err).toBeInstanceOf(name.startsWith('storage') ? StorageError : ChromeError);
    f.clearFailures();
    const r = await undoWrapup(api(f), 'sa-1');
    expect(closedUrls.map((u) => countUrl(f, u))).toEqual([1, 1, 1, 1]);
    expect(r.reopened).toBe(4);
    expect(f.tabs.get(4)!.groupId).toBe(-1);
  });

  it('does nothing more when pressed again after it finished', async () => {
    const f = await wrapped();
    await undoWrapup(api(f), 'sa-1');
    const r = await undoWrapup(api(f), 'sa-1');
    expect(closedUrls.map((u) => countUrl(f, u))).toEqual([1, 1, 1, 1]);
    expect(r.reopened).toBe(4);
  });

  it('does not count a tab the user already had open at that address as reopened', async () => {
    const f = await wrapped();
    await f.chrome.tabs.create({ url: U(3), active: false });
    f.failOn('tabs.create', 2);
    await undoWrapup(api(f), 'sa-1').catch(() => null);
    f.clearFailures();
    await undoWrapup(api(f), 'sa-1');
    expect(countUrl(f, U(3))).toBe(2);
    expect(closedUrls.filter((u) => u !== U(3)).map((u) => countUrl(f, u))).toEqual([1, 1, 1]);
  });

  it("resolves tabs left 'closing': a gone one is reopened, a present one is released", async () => {
    const f = await wrapped();
    const key = 'side.journal.sa-1';
    const j = f.store[key] as any;
    j.tabs['2'].state = 'closing'; // closed in Chrome, but the journal never learned
    j.tabs['4'].state = 'closing'; // still open and grouped
    expect(f.tabs.has(2)).toBe(false);
    expect(f.tabs.get(4)!.groupId).not.toBe(-1);
    const r = await undoWrapup(api(f), 'sa-1');
    expect(countUrl(f, U(2))).toBe(1);
    expect(f.tabs.get(4)!.groupId).toBe(-1);
    expect(r.reopened).toBe(4);
    expect(r.ungrouped).toContain(4);
  });

  it('rejects an unknown set-aside', async () => {
    const f = createFakeChrome();
    await expect(undoWrapup(api(f), 'nope')).rejects.toBeInstanceOf(RejectedError);
  });
});
