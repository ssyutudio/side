import type { TabSnapshot, TabsReport } from '@side/shared';
import { buildPreview, candidateTabs, toApplyPayload, toSetAside } from './wrapupPreview';
import { groupTabs } from './grouping';

function tab(tabId: number, url: string, title: string, extra: Partial<TabSnapshot> = {}): TabSnapshot {
  return {
    tabId, windowId: 1, index: tabId, url, title, lastAccessed: 100 + tabId, active: false, pinned: false,
    audible: false, incognito: false, groupId: -1, groupTitle: null, position: null, ...extra,
  };
}

const tabs: TabSnapshot[] = [
  tab(1, 'https://github.com/acme/retry-queue/pull/12', 'PR 12 · acme/retry-queue'),
  tab(2, 'https://github.com/acme/retry-queue', 'acme/retry-queue'),
  tab(3, 'https://docs.google.com/document/d/D1/edit', 'Retry design notes - Google Docs', { active: true }),
  tab(4, 'https://mail.example.com', 'Inbox', { pinned: true }),
  tab(5, 'https://www.youtube.com/watch?v=1', 'Talk - YouTube', { audible: true }),
  tab(6, 'https://www.youtube.com/watch?v=2', 'Other talk - YouTube'),
  tab(7, 'https://trello.com/b/x', 'Board', { groupId: 9, groupTitle: 'My trip' }),
  tab(8, 'https://docs.google.com/document/d/D2/edit', 'Launch plan - Google Docs', { groupId: 4, groupTitle: 'Launch plan' }),
];

const report: TabsReport = {
  tabs,
  skipped: { excluded: 2, excludedByDomain: { 'client-bank.com': 2 }, incognito: 1, internal: 3 },
  capturedAt: 500,
};

describe('candidateTabs', () => {
  it('leaves out active, pinned, audible, incognito, user-grouped and already set aside tabs', () => {
    const ids = candidateTabs(report, ['Launch plan']).map((t) => t.tabId);
    expect(ids).toEqual([1, 2, 6]);
  });
});

describe('buildPreview', () => {
  const groups = groupTabs(tabs); // deliberately includes tabs that must stay
  const p = buildPreview(report, groups, ['Launch plan']);

  it('folds only tabs that are safe to fold and drops empty groups', () => {
    const folded = p.fold.flatMap((g) => g.tabIds).sort();
    expect(folded).toEqual([1, 2, 6]);
    expect(p.fold.every((g) => g.tabIds.length > 0)).toBe(true);
    expect(p.foldCount).toBe(3);
  });

  it('lists kept tabs with their reasons', () => {
    const reasons = Object.fromEntries(p.kept.map((k) => [k.tabId, k.reason]));
    expect(reasons).toEqual({ 3: 'active', 4: 'pinned', 5: 'audible', 7: 'user_group' });
  });

  it('counts tabs already set aside without folding them again', () => {
    expect(p.alreadySetAside).toEqual([8]);
  });

  it('passes skipped counts through without names of pages', () => {
    expect(p.skipped).toEqual({ excluded: 2, incognito: 1, internal: 3 });
  });

  it('records the URL each folded tab had at preview time', () => {
    expect(Object.keys(p.expectUrls).sort()).toEqual(['1', '2', '6']);
    expect(p.expectUrls['1']).toBe(tabs[0].url);
  });
});

describe('toApplyPayload', () => {
  const p = buildPreview(report, groupTabs(candidateTabs(report, ['Launch plan'])), ['Launch plan']);

  it('folds only by default', () => {
    const cmd = toApplyPayload(p, 'sa1', []);
    expect(cmd.setAsideId).toBe('sa1');
    expect(cmd.closeTabIds).toEqual([]);
    expect(cmd.groups.map((g) => g.tabIds).flat().sort()).toEqual([1, 2, 6]);
  });

  it('closes only tabs of the groups the user confirmed', () => {
    const breaks = p.fold.find((g) => g.key === 'breaks')!;
    const cmd = toApplyPayload(p, 'sa1', ['breaks']);
    expect(cmd.closeTabIds).toEqual(breaks.tabIds);
    expect(cmd.closeTabIds).not.toContain(5);
  });
});

describe('toSetAside', () => {
  it('saves every folded tab with its group before anything goes to Chrome', () => {
    const p = buildPreview(report, groupTabs(candidateTabs(report, [])), []);
    const sa = toSetAside('sa1', p, report, 900, 'Why does jitter double?', ['Wrapped up retry-queue'], false);
    expect(sa.status).toBe('saved');
    expect(sa.endedAt).toBe(900);
    expect(sa.tabs.map((t) => t.tabId).sort()).toEqual([1, 2, 6]);
    expect(sa.tabs.find((t) => t.tabId === 1)?.groupKey).toBe('gh:acme/retry-queue');
    expect(sa.userLine).toBe('Why does jitter double?');
    expect(sa.result).toBeNull();
  });

  it('stores a skipped line as null', () => {
    const p = buildPreview(report, groupTabs(candidateTabs(report, [])), []);
    expect(toSetAside('sa2', p, report, 1, '   ', [], false).userLine).toBeNull();
  });
});
