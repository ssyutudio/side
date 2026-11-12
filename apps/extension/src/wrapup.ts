// Wrap up: fold each work into one named, collapsed Chrome group, and close only the tabs the
// user confirmed. The journal is saved before Chrome is touched and after every step, so pressing
// again after a partial failure ends exactly where one press would.
import { matchExcluded } from '@side/shared';
import type { KeepReason, WrapupApplyPayload, WrapupResult } from '@side/shared';
import { NO_GROUP, urlOf } from './api';
import type { ChromeApi, GroupLike, TabLike } from './api';
import {
  RejectedError,
  chromeCall,
  loadJournal,
  loadRegistry,
  saveJournal,
  saveJournalAndRegistry,
} from './journal';
import type { Journal, SideGroupRecord } from './journal';
import { COPY } from './copy';

export function keepReason(
  tab: TabLike,
  expectedUrl: string | undefined,
  exclusions: readonly string[],
  isSideGroup: (gid: number) => boolean,
): KeepReason | null {
  if (tab.incognito) return 'incognito';
  if (tab.pinned) return 'pinned';
  if (tab.audible) return 'audible';
  if (tab.active) return 'active';
  if (matchExcluded(urlOf(tab), exclusions)) return 'excluded';
  if (expectedUrl === undefined || urlOf(tab) !== expectedUrl) return 'changed';
  if (tab.groupId !== NO_GROUP && !isSideGroup(tab.groupId)) return 'user_group';
  return null;
}

async function getTab(api: ChromeApi, id: number): Promise<TabLike | null> {
  try {
    return await api.tabs.get(id);
  } catch {
    return null;
  }
}

function validate(p: WrapupApplyPayload): void {
  if (p.groups.length === 0) throw new RejectedError(COPY.nothingToSetAside);
  const seen = new Set<number>();
  for (const g of p.groups) {
    for (const id of g.tabIds) {
      if (seen.has(id)) throw new RejectedError(COPY.tabInTwoWorks(id));
      seen.add(id);
    }
  }
}

function newJournal(p: WrapupApplyPayload, now: number): Journal {
  const j: Journal = { setAsideId: p.setAsideId, createdAt: now, groups: [], tabs: {}, groupIds: {}, undone: false };
  for (const g of p.groups) {
    j.groups.push({ key: g.key, name: g.name });
    for (const id of g.tabIds) {
      j.tabs[id] = { key: g.key, url: p.expectUrls[id] ?? '', title: '', windowId: -1, state: 'planned' };
    }
  }
  return j;
}

export async function applyWrapup(
  api: ChromeApi,
  p: WrapupApplyPayload,
  exclusions: readonly string[],
  now: number,
): Promise<WrapupResult> {
  validate(p);
  const existing = await loadJournal(api, p.setAsideId);
  if (existing?.undone) throw new RejectedError(COPY.alreadyUndone);
  const j = existing ?? newJournal(p, now);
  // Save first: nothing in Chrome changes unless this write succeeded.
  await saveJournal(api, j);

  const live = new Map<number, GroupLike>();
  for (const g of await chromeCall(() => api.tabGroups.query({}))) live.set(g.id, g);
  let registry: SideGroupRecord[] = (await loadRegistry(api)).filter((r) => {
    const g = live.get(r.id);
    return g !== undefined && (!g.title || g.title === r.title);
  });
  const isSide = (gid: number) => registry.some((r) => r.id === gid);
  const save = () => saveJournalAndRegistry(api, j, registry);

  // Adopt a group created by an earlier attempt whose record did not reach storage.
  for (const [slot, ids] of Object.entries(j.pending ?? {})) {
    if (j.groupIds[slot] !== undefined) continue;
    for (const id of ids) {
      const t = await getTab(api, id);
      const g = t && t.groupId !== NO_GROUP ? live.get(t.groupId) : undefined;
      if (g && !g.title && !isSide(g.id)) {
        const name = j.groups.find((x) => slot.startsWith(x.key + '@'))?.name ?? '';
        registry.push({ id: g.id, title: name, windowId: g.windowId });
        j.groupIds[slot] = g.id;
        break;
      }
    }
  }

  for (const g of p.groups) {
    const byWindow = new Map<number, number[]>();
    const current = new Map<number, TabLike>();
    for (const id of g.tabIds) {
      const jt = j.tabs[id];
      if (jt.state === 'closed') continue;
      const tab = await getTab(api, id);
      if (!tab) {
        if (jt.state === 'closing') jt.state = 'closed';
        else Object.assign(jt, { state: 'kept', reason: 'gone' as KeepReason });
        continue;
      }
      jt.title = tab.title ?? jt.title;
      jt.windowId = tab.windowId;
      const alreadyIn = jt.state === 'grouped' && tab.groupId === jt.chromeGroupId && isSide(tab.groupId);
      const reason = alreadyIn ? null : keepReason(tab, p.expectUrls[id], exclusions, isSide);
      if (reason) {
        Object.assign(jt, { state: 'kept', reason });
        delete jt.chromeGroupId;
        continue;
      }
      current.set(id, tab);
      byWindow.set(tab.windowId, [...(byWindow.get(tab.windowId) ?? []), id]);
    }

    for (const [windowId, ids] of byWindow) {
      const slot = `${g.key}@${windowId}`;
      let gid: number | undefined = j.groupIds[slot];
      if (gid !== undefined && !isSide(gid)) gid = undefined;
      if (gid === undefined) gid = registry.find((r) => r.title === g.name && r.windowId === windowId)?.id;
      if (gid === undefined) {
        j.pending = { ...(j.pending ?? {}), [slot]: ids };
        await save();
        const created = await chromeCall(() => api.tabs.group({ tabIds: ids, createProperties: { windowId } }));
        registry.push({ id: created, title: g.name, windowId });
        gid = created;
      } else {
        const target = gid;
        const need = ids.filter((id) => current.get(id)!.groupId !== target);
        if (need.length > 0) await chromeCall(() => api.tabs.group({ tabIds: need, groupId: target }));
      }
      j.groupIds[slot] = gid;
      if (j.pending) delete j.pending[slot];
      for (const id of ids) Object.assign(j.tabs[id], { state: 'grouped', chromeGroupId: gid });
      await save();
    }
  }

  // Close only what the user confirmed and what is safely in a Side group right now.
  for (const id of new Set(p.closeTabIds)) {
    const jt = j.tabs[id];
    if (!jt || (jt.state !== 'grouped' && jt.state !== 'closing')) continue;
    const tab = await getTab(api, id);
    if (!tab) {
      if (jt.state === 'closing') jt.state = 'closed';
      else Object.assign(jt, { state: 'kept', reason: 'gone' as KeepReason });
      await save();
      continue;
    }
    const reason = keepReason(tab, p.expectUrls[id], exclusions, isSide);
    if (reason) {
      Object.assign(jt, { state: jt.state === 'closing' ? 'grouped' : jt.state });
      continue;
    }
    Object.assign(jt, { state: 'closing', url: urlOf(tab), title: tab.title ?? jt.title, windowId: tab.windowId });
    await save();
    await chromeCall(() => api.tabs.remove([id]));
    jt.state = 'closed';
    await save();
  }

  // Name and fold each group that still has tabs.
  const stillLive = new Set((await chromeCall(() => api.tabGroups.query({}))).map((g) => g.id));
  // Folding a group that holds the tab the user is looking at makes Chrome switch them to another tab.
  const holdsActive = new Set((await chromeCall(() => api.tabs.query({ active: true }))).map((t) => t.groupId));
  for (const [slot, gid] of Object.entries(j.groupIds)) {
    if (!stillLive.has(gid)) continue;
    const name = j.groups.find((x) => slot.startsWith(x.key + '@'))?.name ?? '';
    await chromeCall(() => api.tabGroups.update(gid, holdsActive.has(gid) ? { title: name } : { title: name, collapsed: true }));
  }
  await save();
  return resultOf(j);
}

export function resultOf(j: Journal): WrapupResult {
  const result: WrapupResult = { grouped: [], closed: [], kept: [] };
  for (const [slot, gid] of Object.entries(j.groupIds)) {
    const key = slot.slice(0, slot.lastIndexOf('@'));
    const tabIds = Object.entries(j.tabs)
      .filter(([, t]) => t.state === 'grouped' && t.chromeGroupId === gid && t.key === key)
      .map(([id]) => Number(id));
    if (tabIds.length > 0) result.grouped.push({ key, chromeGroupId: gid, tabIds });
  }
  for (const [id, t] of Object.entries(j.tabs)) {
    if (t.state === 'closed') result.closed.push(Number(id));
    if (t.state === 'kept' && t.reason) result.kept.push({ tabId: Number(id), reason: t.reason });
  }
  return result;
}
