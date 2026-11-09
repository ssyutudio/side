import type { WorkGroup } from '@side/shared';
import type { WrapupPreview } from './wrapupPreview';
import { moveTab, mergeGroups } from './previewEdit';

const g = (key: string, name: string, tabIds: number[]): WorkGroup => ({ key, name, tabIds, source: 'rule' });
const preview = (): WrapupPreview => ({
  fold: [g('a', 'Side project app', [1, 2, 3]), g('b', 'Remotion video research', [4, 5]), g('c', 'Breaks', [6])],
  kept: [],
  alreadySetAside: [],
  skipped: { excluded: 0, incognito: 0, internal: 0 },
  foldCount: 6,
  expectUrls: { 1: 'u1', 2: 'u2', 3: 'u3', 4: 'u4', 5: 'u5', 6: 'u6' },
});

describe('moveTab', () => {
  it('moves one tab into another group and keeps every tab exactly once', () => {
    const p = moveTab(preview(), 2, 'b');
    expect(p.fold.map((x) => [x.key, x.tabIds])).toEqual([['a', [1, 3]], ['b', [4, 5, 2]], ['c', [6]]]);
    expect(p.foldCount).toBe(6);
    expect(p.expectUrls).toEqual(preview().expectUrls);
  });

  it('drops a group that the move left empty', () => {
    const p = moveTab(preview(), 6, 'a');
    expect(p.fold.map((x) => x.key)).toEqual(['a', 'b']);
  });

  it('changes nothing for an unknown tab, an unknown group, or the same group', () => {
    expect(moveTab(preview(), 99, 'b')).toEqual(preview());
    expect(moveTab(preview(), 2, 'zz')).toEqual(preview());
    expect(moveTab(preview(), 2, 'a')).toEqual(preview());
  });
});

describe('mergeGroups', () => {
  it('puts every tab of one group into another, which keeps its name', () => {
    const p = mergeGroups(preview(), 'c', 'a');
    expect(p.fold.map((x) => [x.key, x.name, x.tabIds])).toEqual([
      ['a', 'Side project app', [1, 2, 3, 6]],
      ['b', 'Remotion video research', [4, 5]],
    ]);
    expect(p.foldCount).toBe(6);
  });

  it('changes nothing when merging a group into itself or into an unknown group', () => {
    expect(mergeGroups(preview(), 'a', 'a')).toEqual(preview());
    expect(mergeGroups(preview(), 'a', 'zz')).toEqual(preview());
  });
});
