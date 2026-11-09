// The wrap-up journal: written to chrome.storage.local before any tab is touched, and updated
// after every step, so a retry or an Undo knows exactly what already happened.
import type { KeepReason } from '@side/shared';
import type { ChromeApi } from './api';

export class StorageError extends Error {}
export class ChromeError extends Error {}
export class RejectedError extends Error {}

export type TabState = 'planned' | 'grouped' | 'kept' | 'closing' | 'closed' | 'reopening' | 'reopened';

export interface JournalTab {
  key: string;
  url: string;
  title: string;
  windowId: number;
  state: TabState;
  reason?: KeepReason;
  chromeGroupId?: number;
}

export interface Journal {
  setAsideId: string;
  createdAt: number;
  groups: { key: string; name: string }[];
  /** Keyed by the original Chrome tab id. */
  tabs: Record<string, JournalTab>;
  /** Chrome group ids this set-aside used, keyed by `${key}@${windowId}`. */
  groupIds: Record<string, number>;
  /** Tabs about to be put in a new group, keyed like groupIds; cleared once the group id is saved. */
  pending?: Record<string, number[]>;
  undone: boolean;
}

/** A group Side created. Title is kept so a reused group id is not mistaken for ours. */
export interface SideGroupRecord {
  id: number;
  title: string;
  windowId: number;
}

const journalKey = (id: string) => `side.journal.${id}`;
const REGISTRY_KEY = 'side.sideGroups';
const LAST_KEY = 'side.lastJournal';

export async function storage<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw new StorageError(e instanceof Error ? e.message : String(e));
  }
}

export async function chromeCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw new ChromeError(e instanceof Error ? e.message : String(e));
  }
}

export async function loadJournal(api: ChromeApi, setAsideId: string): Promise<Journal | null> {
  const got = await storage(() => api.storage.local.get(journalKey(setAsideId)));
  const j = got[journalKey(setAsideId)];
  return j && typeof j === 'object' ? (j as Journal) : null;
}

export async function saveJournal(api: ChromeApi, j: Journal): Promise<void> {
  await storage(() => api.storage.local.set({ [journalKey(j.setAsideId)]: j, [LAST_KEY]: j.setAsideId }));
}

export async function loadRegistry(api: ChromeApi): Promise<SideGroupRecord[]> {
  const got = await storage(() => api.storage.local.get(REGISTRY_KEY));
  const list = got[REGISTRY_KEY];
  return Array.isArray(list) ? (list as SideGroupRecord[]) : [];
}

/** Saves the journal and the Side group registry in one write. */
export async function saveJournalAndRegistry(api: ChromeApi, j: Journal, registry: SideGroupRecord[]): Promise<void> {
  await storage(() =>
    api.storage.local.set({ [journalKey(j.setAsideId)]: j, [LAST_KEY]: j.setAsideId, [REGISTRY_KEY]: registry }),
  );
}

export async function saveRegistry(api: ChromeApi, registry: SideGroupRecord[]): Promise<void> {
  await storage(() => api.storage.local.set({ [REGISTRY_KEY]: registry }));
}
