// Undo the last wrap up: release this set-aside's tabs from Side's groups and reopen every tab
// it closed exactly once. Each reopen is journaled before and after, so a retry never doubles one.
import type { UndoResult } from '@side/shared';
import { urlOf } from './api';
import type { ChromeApi, TabLike } from './api';
import { RejectedError, chromeCall, loadJournal, saveJournal } from './journal';
import type { Journal } from './journal';
import { COPY } from './copy';

function undoResult(j: Journal): UndoResult {
  const entries = Object.entries(j.tabs);
  return {
    ungrouped: entries.filter(([, t]) => t.state === 'ungrouped').map(([id]) => Number(id)),
    reopened: entries.filter(([, t]) => t.state === 'reopened').length,
  };
}

export async function undoWrapup(api: ChromeApi, setAsideId: string): Promise<UndoResult> {
  const j = await loadJournal(api, setAsideId);
  if (!j) throw new RejectedError(COPY.nothingToUndo);
  if (j.undone) return undoResult(j);

  const sideGroups = new Set(Object.values(j.groupIds));
  const all = await chromeCall(() => api.tabs.query({}));

  // A tab left 'closing' (the worker died or the next save failed) is either gone, so reopen it,
  // or still here, so treat it as grouped and release it.
  const liveIds = new Set(all.map((t) => t.id));
  let resolved = false;
  for (const [id, jt] of Object.entries(j.tabs)) {
    if (jt.state !== 'closing') continue;
    jt.state = liveIds.has(Number(id)) ? 'grouped' : 'closed';
    resolved = true;
  }
  if (resolved) await saveJournal(api, j);

  const toUngroup = all
    .filter((t) => t.id !== undefined && sideGroups.has(t.groupId) && j.tabs[t.id]?.state === 'grouped')
    .map((t) => t.id as number);
  if (toUngroup.length > 0) {
    await chromeCall(() => api.tabs.ungroup(toUngroup));
    for (const id of toUngroup) j.tabs[id].state = 'ungrouped';
    await saveJournal(api, j);
  }
  // Tabs that were grouped but are no longer in that group (moved or closed by the user) are left as they are.

  for (const jt of Object.values(j.tabs)) {
    if (jt.state !== 'closed' && jt.state !== 'reopening') continue;
    const now: TabLike[] = await chromeCall(() => api.tabs.query({}));
    const sameUrl = now.filter((t) => t.id !== undefined && urlOf(t) === jt.url);
    if (jt.state === 'reopening') {
      // An earlier attempt may have opened it before its record was saved.
      const ours = sameUrl.find((t) => !(jt.existingIds ?? []).includes(t.id as number));
      if (ours) {
        Object.assign(jt, { state: 'reopened', reopenedId: ours.id });
        await saveJournal(api, j);
        continue;
      }
    } else {
      Object.assign(jt, { state: 'reopening', existingIds: sameUrl.map((t) => t.id as number) });
      await saveJournal(api, j);
    }
    const windowAlive = now.some((t) => t.windowId === jt.windowId);
    const created = await chromeCall(() =>
      api.tabs.create(windowAlive ? { url: jt.url, windowId: jt.windowId, active: false } : { url: jt.url, active: false }),
    );
    Object.assign(jt, { state: 'reopened', reopenedId: created.id });
    await saveJournal(api, j);
  }

  j.undone = true;
  await saveJournal(api, j);
  return undoResult(j);
}
