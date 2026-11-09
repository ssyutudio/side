// Hand edits to the Wrap up draft before it is confirmed: move one tab to another group, or merge
// two groups. Every tab stays in exactly one group; empty groups disappear; the URLs Chrome must
// still match are untouched.
import type { WrapupPreview } from './wrapupPreview';

export function moveTab(p: WrapupPreview, tabId: number, toKey: string): WrapupPreview {
  const from = p.fold.find((g) => g.tabIds.includes(tabId));
  const to = p.fold.find((g) => g.key === toKey);
  if (!from || !to || from.key === to.key) return p;
  const fold = p.fold
    .map((g) =>
      g.key === from.key ? { ...g, tabIds: g.tabIds.filter((id) => id !== tabId) } : g.key === to.key ? { ...g, tabIds: [...g.tabIds, tabId] } : g,
    )
    .filter((g) => g.tabIds.length > 0);
  return { ...p, fold };
}

export function mergeGroups(p: WrapupPreview, fromKey: string, intoKey: string): WrapupPreview {
  const from = p.fold.find((g) => g.key === fromKey);
  const into = p.fold.find((g) => g.key === intoKey);
  if (!from || !into || from.key === into.key) return p;
  const fold = p.fold
    .filter((g) => g.key !== fromKey)
    .map((g) => (g.key === intoKey ? { ...g, tabIds: [...g.tabIds, ...from.tabIds] } : g));
  return { ...p, fold };
}
