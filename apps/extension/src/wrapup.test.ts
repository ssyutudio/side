import { applyWrapup } from './wrapup';
import { StorageError, ChromeError, RejectedError, loadJournal } from './journal';
import { createFakeChrome, makeTab } from './testing/fakeChrome';
import type { FakeChrome } from './testing/fakeChrome';
import type { ChromeApi } from './api';
import type { WrapupApplyPayload } from '@side/shared';

const U = (n: number) => `https://github.com/side/repo/issues/${n}`;

function world() {
  const tabs = [
    makeTab(1, U(1), { index: 0, active: true }),
    makeTab(2, U(2), { index: 1 }),
    makeTab(3, U(3), { index: 2 }),
    makeTab(4, U(4), { index: 3 }),
    makeTab(5, U(5), { index: 4, pinned: true }),
    makeTab(6, U(6), { index: 5, audible: true }),
    makeTab(7, U(7), { index: 6 }),
    makeTab(8, U(8), { index: 7, groupId: 90 }),
    makeTab(9, U(9), { index: 8 }),
    makeTab(10, U(10), { index: 9, windowId: 2 }),
  ];
  const fake = createFakeChrome(tabs);
  fake.groups.set(90, { id: 90, collapsed: false, color: 'red', title: 'Mine', windowId: 1 });
  return fake;
}

function payload(over: Partial<WrapupApplyPayload> = {}): WrapupApplyPayload {
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  return {
    setAsideId: 'sa-1',
    groups: [
      { key: 'g-retry', name: 'Retry tests', tabIds: [1, 2, 3, 4, 5] },
      { key: 'g-docs', name: 'Docs', tabIds: [6, 7, 8, 9, 10] },
    ],
    closeTabIds: [],
    expectUrls: Object.fromEntries(ids.map((i) => [String(i), U(i)])),
    ...over,
  };
}

const api = (f: FakeChrome) => f.chrome as unknown as ChromeApi;

/** End state that matters to the user: which tabs exist, in which named group, and the groups. */
function endState(f: FakeChrome) {
  const title = (gid: number) => (gid === -1 ? null : f.groups.get(gid)?.title ?? '?');
  return {
    tabs: [...f.tabs.values()].map((t) => [t.url, title(t.groupId)]).sort(),
    groups: [...f.groups.values()].map((g) => [g.title, g.windowId, g.collapsed]).sort(),
  };
}

describe('applyWrapup', () => {
  it('folds each work into one collapsed, named group per window', async () => {
    const f = world();
    const r = await applyWrapup(api(f), payload(), [], 1);
    expect(f.tabs.get(2)!.groupId).toBe(f.tabs.get(3)!.groupId);
    const retry = f.groups.get(f.tabs.get(2)!.groupId)!;
    expect(retry).toMatchObject({ title: 'Retry tests', collapsed: true, windowId: 1 });
    const docs1 = f.groups.get(f.tabs.get(7)!.groupId)!;
    const docs2 = f.groups.get(f.tabs.get(10)!.groupId)!;
    expect(docs1).toMatchObject({ title: 'Docs', windowId: 1, collapsed: true });
    expect(docs2).toMatchObject({ title: 'Docs', windowId: 2, collapsed: true });
    expect(r.grouped.map((g) => g.key).sort()).toEqual(['g-docs', 'g-docs', 'g-retry']);
    expect(f.tabs.size).toBe(10);
  });

  it('leaves active, pinned, audible, user-grouped, excluded, changed and gone tabs alone with reasons', async () => {
    const f = world();
    f.tabs.get(4)!.url = 'https://github.com/side/repo/pull/99';
    f.tabs.get(9)!.url = 'https://client-bank.com/statement';
    f.tabs.delete(3);
    const p = payload();
    p.expectUrls['9'] = 'https://client-bank.com/statement';
    const r = await applyWrapup(api(f), p, ['client-bank.com'], 1);
    const reasons = Object.fromEntries(r.kept.map((k) => [k.tabId, k.reason]));
    expect(reasons).toEqual({ 1: 'active', 3: 'gone', 4: 'changed', 5: 'pinned', 6: 'audible', 8: 'user_group', 9: 'excluded' });
    for (const id of [1, 4, 5, 6, 9]) expect(f.tabs.get(id)!.groupId).toBe(-1);
    expect(f.tabs.get(8)!.groupId).toBe(90);
    expect(f.groups.get(90)).toMatchObject({ title: 'Mine', collapsed: false });
  });

  it('adds to the Side group of the same name instead of making another', async () => {
    const f = world();
    await applyWrapup(api(f), payload({ groups: [{ key: 'g-retry', name: 'Retry tests', tabIds: [2] }] }), [], 1);
    await applyWrapup(api(f), payload({ setAsideId: 'sa-2', groups: [{ key: 'g-retry', name: 'Retry tests', tabIds: [3, 7] }] }), [], 2);
    const retryGroups = [...f.groups.values()].filter((g) => g.title === 'Retry tests');
    expect(retryGroups).toHaveLength(1);
    expect([2, 3, 7].map((id) => f.tabs.get(id)!.groupId)).toEqual([retryGroups[0].id, retryGroups[0].id, retryGroups[0].id]);
  });

  it('does not add to a group the user made, even with the same name', async () => {
    const f = world();
    f.groups.get(90)!.title = 'Retry tests';
    await applyWrapup(api(f), payload({ groups: [{ key: 'g-retry', name: 'Retry tests', tabIds: [2, 3] }] }), [], 1);
    expect(f.tabs.get(2)!.groupId).not.toBe(90);
    expect([...f.tabs.values()].filter((t) => t.groupId === 90).map((t) => t.id)).toEqual([8]);
  });

  it('saves the journal first; a storage failure touches no tab', async () => {
    const f = world();
    f.failOn('storage.set', 1);
    const before = endState(f);
    await expect(applyWrapup(api(f), payload({ closeTabIds: [2, 3] }), [], 1)).rejects.toBeInstanceOf(StorageError);
    expect(endState(f)).toEqual(before);
    expect(f.calls.some((c) => /^tabs\.(group|remove|ungroup)|^tabGroups\.update/.test(c))).toBe(false);
  });

  it('closes only confirmed tabs that were safely grouped, journaling them first', async () => {
    const f = world();
    const p = payload({ closeTabIds: [1, 2, 3, 5, 6, 8, 42] });
    const r = await applyWrapup(api(f), p, [], 1);
    expect(r.closed.sort()).toEqual([2, 3]);
    for (const id of [1, 5, 6, 8]) expect(f.tabs.has(id)).toBe(true);
    const j = await loadJournal(api(f), 'sa-1');
    expect(j!.tabs['2']).toMatchObject({ url: U(2), state: 'closed', windowId: 1 });
  });

  it('does not close a tab whose address changed after the preview', async () => {
    const f = world();
    const p = payload({ closeTabIds: [2, 3] });
    f.tabs.get(3)!.url = U(33);
    const r = await applyWrapup(api(f), p, [], 1);
    expect(r.closed).toEqual([2]);
    expect(f.tabs.has(3)).toBe(true);
  });

  it('rejects a tab placed in two works', async () => {
    const f = world();
    const p = payload({ groups: [{ key: 'a', name: 'A', tabIds: [2] }, { key: 'b', name: 'B', tabIds: [2] }] });
    await expect(applyWrapup(api(f), p, [], 1)).rejects.toBeInstanceOf(RejectedError);
    expect(f.calls.some((c) => c === 'tabs.group')).toBe(false);
  });

  describe('retry after a partial failure ends where one press would', () => {
    const points: [string, number][] = [
      ['tabs.group', 1],
      ['tabs.group', 2],
      ['tabGroups.update', 1],
      ['tabGroups.update', 2],
      ['tabs.remove', 1],
      ['tabs.remove', 2],
      ['tabs.remove', 4],
      ['storage.set', 2],
      ['storage.set', 3],
      ['storage.set', 6],
    ];
    const p = () => payload({ closeTabIds: [2, 3, 7, 10] });

    it.each(points)('fails on %s #%i, then succeeds', async (name, nth) => {
      const clean = world();
      const cleanResult = await applyWrapup(api(clean), p(), [], 1);

      const f = world();
      f.failOn(name, nth);
      const first = await applyWrapup(api(f), p(), [], 1).then(
        () => null,
        (e) => e,
      );
      expect(first).toBeInstanceOf(name.startsWith('storage') ? StorageError : ChromeError);
      f.clearFailures();
      const second = await applyWrapup(api(f), p(), [], 1);

      expect(endState(f)).toEqual(endState(clean));
      expect(second.closed.sort()).toEqual(cleanResult.closed.sort());
      expect(f.calls.filter((c) => c === 'tabs.remove').length).toBeLessThanOrEqual(cleanResult.closed.length + 1);
    });
  });
});
