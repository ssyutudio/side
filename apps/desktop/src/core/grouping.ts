// Rule-based grouping of tabs into works. This is the path whenever the LLM is
// off, has no key, fails or is slow, so it must produce a sensible, deterministic draft alone.
//
// Order of rules:
//   1. Video and social tabs go to Breaks.
//   2. Anchors: a GitHub repo, a Google Doc/Sheet/Slide, a Figma file, a Notion
//      page, or local dev servers each define one work.
//   3. Reference tabs join the anchor they share the most title words with.
//   4. Remaining tabs from the same site form a group named after the site.
//   5. Remaining tabs that share a meaningful title word form a group.
//   6. Anything left goes to one "Not sorted yet" group.
import type { TabSnapshot, WorkGroup } from '@side/shared';
import { hostOf } from '@side/shared';
import { groupNames } from './copy';

export const BREAKS_KEY = 'breaks';
export const UNSORTED_KEY = 'unsorted';
export const MAX_GROUP_NAME = 40;

const BREAK_HOSTS = [
  'youtube.com', 'youtu.be', 'netflix.com', 'twitch.tv', 'tiktok.com', 'instagram.com',
  'facebook.com', 'x.com', 'twitter.com', 'reddit.com', 'news.ycombinator.com', 'threads.net',
  'disneyplus.com', 'vimeo.com', 'pinterest.com', 'linkedin.com/feed',
];

const GITHUB_RESERVED = new Set([
  'settings', 'notifications', 'pulls', 'issues', 'marketplace', 'explore', 'orgs', 'login',
  'features', 'topics', 'sponsors', 'new', 'organizations', 'search', 'trending', 'codespaces',
]);

const STOP = new Set(
  ('the and for with from into your you how what why when this that are was use using new all can not but has ' +
    'have our its get one two more off out via per about over under after before than then them they will ' +
    'google docs doc github stack overflow youtube notion figma home page pages untitled document sheet sheets ' +
    'slides guide documentation reference mdn web pull request issue commit main master edit view search ' +
    'result inbox mail gmail tab blog post com www http https html api app dashboard welcome login sign ' +
    'file files design draft copy') .split(' '),
);

const SUFFIX = /\s+[-–—|·/]\s+(google docs|google sheets|google slides|google drive|notion|github|youtube|stack overflow|figma|mdn web docs|mdn|x|medium|reddit|linear|gmail)\s*$/i;

/** A page title without the app name at the end ("Q3 numbers - Google Sheets" -> "Q3 numbers"). */
export function cleanTitle(title: string): string {
  let t = title.trim();
  for (let i = 0; i < 2; i++) t = t.replace(SUFFIX, '').trim();
  return t;
}

export function shortName(name: string): string {
  const n = name.replace(/\s+/g, ' ').trim();
  return n.length <= MAX_GROUP_NAME ? n : n.slice(0, MAX_GROUP_NAME - 1).trimEnd() + '…';
}

export function isBreakUrl(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  let path = '';
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return BREAK_HOSTS.some((b) => {
    const [h, p] = b.split('/');
    const hostMatch = host === h || host.endsWith('.' + h);
    return hostMatch && (!p || path.startsWith('/' + p));
  });
}

function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** Meaningful lowercase words of a title (stop words, short words and numbers removed). */
export function keywords(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || /\d/.test(raw)) continue;
    const w = stem(raw);
    if (STOP.has(w) || STOP.has(raw)) continue;
    out.add(w);
  }
  return out;
}

interface Anchor {
  key: string;
  name: string;
}

function anchorOf(t: TabSnapshot): Anchor | null {
  let u: URL;
  try {
    u = new URL(t.url);
  } catch {
    return null;
  }
  const host = hostOf(t.url);
  if (!host) return null;
  const seg = u.pathname.split('/').filter(Boolean);
  const title = cleanTitle(t.title);

  if (host === 'github.com' && seg.length >= 2 && !GITHUB_RESERVED.has(seg[0].toLowerCase())) {
    const repo = `${seg[0]}/${seg[1]}`.toLowerCase();
    return { key: `gh:${repo}`, name: seg[1] };
  }
  if (host === 'docs.google.com' && seg.length >= 3 && seg[1] === 'd') {
    return { key: `doc:${seg[2]}`, name: title || groupNames.doc };
  }
  if (host === 'figma.com' && seg.length >= 2 && ['file', 'design', 'board', 'proto'].includes(seg[0])) {
    return { key: `figma:${seg[1]}`, name: title || groupNames.figma };
  }
  if (host === 'notion.so' || host.endsWith('.notion.site')) {
    const last = seg[seg.length - 1] ?? '';
    const id = last.match(/([0-9a-f]{32})$/i)?.[1];
    if (id) return { key: `notion:${id.toLowerCase()}`, name: title || groupNames.notion };
  }
  if (host === 'localhost' || host === '127.0.0.1') {
    return { key: 'host:localhost', name: groupNames.localDev };
  }
  return null;
}

function byPosition(a: TabSnapshot, b: TabSnapshot): number {
  return a.windowId - b.windowId || a.index - b.index || a.tabId - b.tabId;
}

interface Draft {
  key: string;
  name: string;
  tabs: TabSnapshot[];
  words: Set<string>;
}

function capitalize(w: string): string {
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** Groups tabs into works. Every tab ends up in exactly one group. */
export function groupTabs(input: readonly TabSnapshot[]): WorkGroup[] {
  const tabs = [...input].sort(byPosition);
  const breaks: TabSnapshot[] = [];
  const anchors = new Map<string, Draft>();
  let loose: TabSnapshot[] = [];

  for (const t of tabs) {
    if (isBreakUrl(t.url)) {
      breaks.push(t);
      continue;
    }
    const a = anchorOf(t);
    if (!a) {
      loose.push(t);
      continue;
    }
    let d = anchors.get(a.key);
    if (!d) {
      d = { key: a.key, name: a.name, tabs: [], words: keywords(a.name.replace(/[-_]/g, ' ')) };
      anchors.set(a.key, d);
    }
    d.tabs.push(t);
    for (const w of keywords(cleanTitle(t.title))) d.words.add(w);
  }

  // Reference tabs join the anchor with the most shared words (ties: first anchor).
  const anchorList = [...anchors.values()];
  const stillLoose: TabSnapshot[] = [];
  for (const t of loose) {
    const words = keywords(cleanTitle(t.title));
    let best: Draft | null = null;
    let bestScore = 0;
    for (const d of anchorList) {
      let score = 0;
      for (const w of words) if (d.words.has(w)) score++;
      if (score > bestScore) {
        best = d;
        bestScore = score;
      }
    }
    if (best) best.tabs.push(t);
    else stillLoose.push(t);
  }
  loose = stillLoose;

  const drafts: Draft[] = [...anchorList];

  // Same site, two or more tabs.
  const byHost = new Map<string, TabSnapshot[]>();
  for (const t of loose) {
    const h = hostOf(t.url) ?? '';
    byHost.set(h, [...(byHost.get(h) ?? []), t]);
  }
  loose = [];
  for (const [h, list] of byHost) {
    if (h && list.length >= 2) drafts.push({ key: `host:${h}`, name: h, tabs: list, words: new Set() });
    else loose.push(...list);
  }
  loose.sort(byPosition);

  // Shared meaningful word among the rest (union of tabs that share any word).
  const wordsOf = loose.map((t) => keywords(cleanTitle(t.title)));
  const freq = new Map<string, number>();
  for (const ws of wordsOf) for (const w of ws) freq.set(w, (freq.get(w) ?? 0) + 1);
  const parent = loose.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const firstWithWord = new Map<string, number>();
  wordsOf.forEach((ws, i) => {
    for (const w of ws) {
      if ((freq.get(w) ?? 0) < 2) continue;
      const j = firstWithWord.get(w);
      if (j === undefined) firstWithWord.set(w, i);
      else parent[find(i)] = find(j);
    }
  });
  const clusters = new Map<number, number[]>();
  loose.forEach((_, i) => clusters.set(find(i), [...(clusters.get(find(i)) ?? []), i]));
  const unsorted: TabSnapshot[] = [];
  for (const members of clusters.values()) {
    if (members.length < 2) {
      unsorted.push(loose[members[0]]);
      continue;
    }
    const count = new Map<string, number>();
    for (const i of members) for (const w of wordsOf[i]) if ((freq.get(w) ?? 0) >= 2) count.set(w, (count.get(w) ?? 0) + 1);
    const word = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    drafts.push({ key: `kw:${word}`, name: capitalize(word), tabs: members.map((i) => loose[i]), words: new Set() });
  }

  const ordered = drafts
    .map((d) => ({ ...d, tabs: [...d.tabs].sort(byPosition) }))
    .sort((a, b) => byPosition(a.tabs[0], b.tabs[0]) || a.key.localeCompare(b.key));
  const out: WorkGroup[] = ordered.map((d) => ({
    key: d.key,
    name: shortName(d.name),
    tabIds: d.tabs.map((t) => t.tabId),
    source: 'rule',
  }));
  if (breaks.length) out.push({ key: BREAKS_KEY, name: groupNames.breaks, tabIds: breaks.map((t) => t.tabId), source: 'rule' });
  if (unsorted.length) {
    out.push({ key: UNSORTED_KEY, name: groupNames.unsorted, tabIds: unsorted.sort(byPosition).map((t) => t.tabId), source: 'rule' });
  }
  return out;
}
