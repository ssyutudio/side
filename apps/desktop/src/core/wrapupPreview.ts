// Wrap up preview: which tabs fold into which named group, which stay and why.
// Folding is the default; closing only ever covers groups the user confirmed.
// The SetAside record is built from the preview and saved before Chrome is touched.
import type { KeepReason, KeptTab, SetAside, TabSnapshot, TabsReport, WorkGroup, WrapupApplyPayload } from '@side/shared';

export interface WrapupPreview {
  fold: WorkGroup[];
  kept: KeptTab[];
  /** Tabs already inside a group Side made earlier. Not folded again, not closed. */
  alreadySetAside: number[];
  skipped: { excluded: number; incognito: number; internal: number };
  foldCount: number;
  /** URL each folded tab had in the preview. The extension leaves a tab alone if it changed. */
  expectUrls: Record<string, string>;
}

/** Why a tab must stay as it is, or null if it can be folded. */
export function keepReason(t: TabSnapshot): KeepReason | null {
  if (t.incognito) return 'incognito';
  if (t.pinned) return 'pinned';
  if (t.audible) return 'audible';
  if (t.active) return 'active';
  if (t.groupId !== -1) return 'user_group';
  return null;
}

function isAlreadySetAside(t: TabSnapshot, sideGroupNames: readonly string[]): boolean {
  return t.groupId !== -1 && t.groupTitle !== null && sideGroupNames.includes(t.groupTitle);
}

/** Tabs that may be grouped and folded. Group these, then build the preview. */
export function candidateTabs(report: TabsReport, sideGroupNames: readonly string[]): TabSnapshot[] {
  return report.tabs.filter((t) => !isAlreadySetAside(t, sideGroupNames) && keepReason(t) === null);
}

export function buildPreview(report: TabsReport, groups: readonly WorkGroup[], sideGroupNames: readonly string[]): WrapupPreview {
  const kept: KeptTab[] = [];
  const alreadySetAside: number[] = [];
  const foldable = new Map<number, TabSnapshot>();
  for (const t of report.tabs) {
    if (isAlreadySetAside(t, sideGroupNames)) {
      alreadySetAside.push(t.tabId);
      continue;
    }
    const reason = keepReason(t);
    if (reason) kept.push({ tabId: t.tabId, title: t.title, reason });
    else foldable.set(t.tabId, t);
  }

  const used = new Set<number>();
  const fold: WorkGroup[] = [];
  for (const g of groups) {
    const tabIds = g.tabIds.filter((id) => foldable.has(id) && !used.has(id));
    tabIds.forEach((id) => used.add(id));
    if (tabIds.length) fold.push({ ...g, tabIds });
  }

  const expectUrls: Record<string, string> = {};
  for (const id of used) expectUrls[String(id)] = foldable.get(id)!.url;

  return {
    fold,
    kept,
    alreadySetAside,
    skipped: { excluded: report.skipped.excluded, incognito: report.skipped.incognito, internal: report.skipped.internal },
    foldCount: used.size,
    expectUrls,
  };
}

/** The command for the extension. `closeGroupKeys` are groups whose tab list the user confirmed closing. */
export function toApplyPayload(preview: WrapupPreview, setAsideId: string, closeGroupKeys: readonly string[]): WrapupApplyPayload {
  const closeTabIds = preview.fold.filter((g) => closeGroupKeys.includes(g.key)).flatMap((g) => g.tabIds);
  return {
    setAsideId,
    groups: preview.fold.map((g) => ({ key: g.key, name: g.name, tabIds: [...g.tabIds] })),
    closeTabIds,
    expectUrls: { ...preview.expectUrls },
  };
}

/** The local record of this Wrap up, saved first (status 'saved'). */
export function toSetAside(
  id: string,
  preview: WrapupPreview,
  report: TabsReport,
  endedAt: number,
  userLine: string | null,
  todayDone: string[],
  closeRequested: boolean,
): SetAside {
  const byId = new Map(report.tabs.map((t) => [t.tabId, t]));
  const tabs = preview.fold.flatMap((g) =>
    g.tabIds.map((tabId) => {
      const t = byId.get(tabId)!;
      return { tabId, url: t.url, title: t.title, lastAccessed: t.lastAccessed, position: t.position, groupKey: g.key };
    }),
  );
  const line = userLine?.trim();
  return {
    id,
    endedAt,
    tabs,
    groups: preview.fold.map((g) => ({ ...g, tabIds: [...g.tabIds] })),
    kept: [...preview.kept],
    userLine: line ? line : null,
    todayDone: [...todayDone],
    closeRequested,
    status: 'saved',
    result: null,
  };
}
