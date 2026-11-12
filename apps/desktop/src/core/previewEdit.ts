// Hand edits to the Wrap up draft before it is confirmed: move one tab to another group, merge
// two groups, take a tab out into a new group, or rename a group (the name Chrome's group gets). Every tab stays in exactly one group; empty groups disappear; the URLs Chrome must
// still match are untouched.
import { t } from '../i18n';
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

/** The name a new group gets until the person types one (English; `newGroupName()` is in the screen language). */
export const NEW_GROUP_NAME = 'New group';
export const newGroupName = (): string => t('New group');
export const GROUP_NAME_MAX = 40;

/** A group name as it may be used: one line, trimmed, at most 40 characters. Empty means "no name". */
export function cleanGroupName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, GROUP_NAME_MAX).trim();
}

/** Takes one tab out into a new group of its own (placed last). Returns the new group's key. */
export function newGroup(p: WrapupPreview, tabId: number, name = newGroupName()): { preview: WrapupPreview; key: string | null } {
  const from = p.fold.find((g) => g.tabIds.includes(tabId));
  if (!from) return { preview: p, key: null };
  // A tab that is already alone in its group stays where it is.
  if (from.tabIds.length === 1) return { preview: p, key: from.key };
  const keys = new Set(p.fold.map((g) => g.key));
  let n = 1;
  while (keys.has(`u${n}`)) n++;
  const key = `u${n}`;
  const fold = [
    ...p.fold.map((g) => (g.key === from.key ? { ...g, tabIds: g.tabIds.filter((id) => id !== tabId) } : g)),
    { key, name: cleanGroupName(name) || newGroupName(), tabIds: [tabId], source: 'rule' as const },
  ];
  return { preview: { ...p, fold }, key };
}

/** Renames a group. An empty name leaves it as it was. */
export function renameGroup(p: WrapupPreview, key: string, name: string): WrapupPreview {
  const clean = cleanGroupName(name);
  if (!clean || !p.fold.some((g) => g.key === key)) return p;
  return { ...p, fold: p.fold.map((g) => (g.key === key ? { ...g, name: clean } : g)) };
}
