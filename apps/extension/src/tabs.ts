// Builds the tab report the app sees. Tabs on excluded sites, incognito tabs and non-web pages
// are dropped here, before anything leaves Chrome; only their counts are reported.
import { matchExcluded, normalizeDomain } from '@side/shared';
import type { PagePosition, TabSnapshot, TabsReport } from '@side/shared';
import { NO_GROUP, isWebUrl, urlOf } from './api';
import type { ChromeApi, TabLike } from './api';

const EXCLUSIONS_KEY = 'side.exclusions';

// The app drops a whole report if one field is over these limits (see packages/shared messages.ts).
const MAX_TABS = 2000;
const MAX_URL = 8192;
const MAX_TITLE = 2000;
const MAX_GROUP_TITLE = 500;
const MAX_SELECTOR = 500;
const MAX_QUOTE = 300;

/** A position the app will accept: one with an over-long selector is useless, an over-long quote is just left out. */
function fitPosition(p: PagePosition | undefined): PagePosition | null {
  if (!p) return null;
  if (p.selector !== null && p.selector.length > MAX_SELECTOR) return null;
  return p.quote !== null && p.quote.length > MAX_QUOTE ? { ...p, quote: null } : p;
}

export function buildReport(
  tabs: TabLike[],
  exclusions: readonly string[],
  positions: ReadonlyMap<number, PagePosition>,
  groupTitles: ReadonlyMap<number, string>,
  now: number,
): TabsReport {
  const report: TabsReport = {
    tabs: [],
    skipped: { excluded: 0, excludedByDomain: {}, incognito: 0, internal: 0 },
    capturedAt: now,
  };
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    if (tab.incognito) {
      report.skipped.incognito++;
      continue;
    }
    const url = urlOf(tab);
    if (!isWebUrl(url)) {
      report.skipped.internal++;
      continue;
    }
    const hit = matchExcluded(url, exclusions);
    if (hit) {
      report.skipped.excluded++;
      report.skipped.excludedByDomain[hit] = (report.skipped.excludedByDomain[hit] ?? 0) + 1;
      continue;
    }
    if (url.length > MAX_URL) {
      report.skipped.internal++;
      continue;
    }
    if (report.tabs.length >= MAX_TABS) continue;
    const groupTitle = tab.groupId !== NO_GROUP ? groupTitles.get(tab.groupId) ?? null : null;
    const snap: TabSnapshot = {
      tabId: tab.id,
      windowId: tab.windowId,
      index: tab.index,
      url,
      title: (tab.title ?? '').slice(0, MAX_TITLE),
      lastAccessed: tab.lastAccessed ?? null,
      active: tab.active,
      pinned: tab.pinned,
      audible: tab.audible ?? false,
      incognito: false,
      groupId: tab.groupId ?? NO_GROUP,
      groupTitle: groupTitle === null ? null : groupTitle.slice(0, MAX_GROUP_TITLE),
      position: fitPosition(positions.get(tab.id)),
    };
    report.tabs.push(snap);
  }
  return report;
}

export async function snapshotTabs(
  api: ChromeApi,
  exclusions: readonly string[],
  positions: ReadonlyMap<number, PagePosition>,
  now: number,
): Promise<TabsReport> {
  const [tabs, groups] = await Promise.all([api.tabs.query({}), api.tabGroups.query({})]);
  const titles = new Map<number, string>();
  for (const g of groups) if (g.title) titles.set(g.id, g.title);
  return buildReport(tabs, exclusions, positions, titles, now);
}

export async function loadExclusions(api: ChromeApi): Promise<string[]> {
  const got = await api.storage.local.get(EXCLUSIONS_KEY);
  const list = got[EXCLUSIONS_KEY];
  return Array.isArray(list) ? list.filter((d): d is string => typeof d === 'string') : [];
}

export async function saveExclusions(api: ChromeApi, raw: readonly string[]): Promise<string[]> {
  const clean: string[] = [];
  for (const r of raw) {
    const d = normalizeDomain(r);
    if (d && !clean.includes(d)) clean.push(d);
  }
  await api.storage.local.set({ [EXCLUSIONS_KEY]: clean });
  return clean;
}

/** Collapses bursts of tab events into one report. */
export function createDebouncer(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}
