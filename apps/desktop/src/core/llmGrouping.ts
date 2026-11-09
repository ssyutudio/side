// Optional LLM help for naming and grouping works (off by default, Director 1-B).
// What leaves the Mac: tab titles with temporary ids (T1..Tn) and the user's own
// line. Never URLs, hosts or page text. The answer may only pick from those ids;
// anything else is dropped, leftovers go to the rules, and an answer that arrives
// after the deadline or for an older request is not applied automatically.
import type { TabSnapshot, WorkGroup } from '@side/shared';
import { isExcluded, newId } from '@side/shared';
import type { Clock } from './clock';
import { cleanTitle, groupTabs, shortName } from './grouping';

export const DEFAULT_LLM_TIMEOUT_MS = 8000;
const MAX_TITLE = 120;

export interface GroupingRequest {
  token: string;
  deadline: number;
  /** Temporary id -> Chrome tab id. Only this map can turn an answer back into tabs. */
  ids: Map<string, number>;
  system: string;
  user: string;
}

export type GroupingFailure = 'late' | 'stale' | 'unparseable' | 'error' | 'timeout';

export interface GroupingOutcome {
  groups: WorkGroup[];
  applied: boolean;
  reason?: GroupingFailure;
  /** Exactly what was sent, for the request log in "What Side saw". */
  sent?: string;
}

export type LlmTransport = (req: { system: string; user: string }) => Promise<string>;

const SYSTEM =
  'You sort browser tabs into a few works so a person can set them aside for the night. ' +
  'You only see tab titles with ids. Reply with JSON only: {"groups":[{"name":"short work name","ids":["T1"]}]}. ' +
  'Use each id at most once. Names are plain English, at most 40 characters, no emoji. ' +
  'Put videos and social feeds in a group named "Breaks". Leave out ids you are unsure about.';

function stripUrls(s: string): string {
  return s.replace(/https?:\/\/\S+/gi, '').replace(/\b[a-z0-9-]+(\.[a-z0-9-]+)+\.(com|org|net|io|app|dev|so|ai|co)\b/gi, '').trim();
}

export function buildGroupingRequest(
  tabs: readonly TabSnapshot[],
  userLine: string | null,
  excludedDomains: readonly string[],
  clock: Clock,
  timeoutMs = DEFAULT_LLM_TIMEOUT_MS,
): GroupingRequest {
  const ids = new Map<string, number>();
  const lines: string[] = [];
  for (const t of tabs) {
    if (isExcluded(t.url, excludedDomains)) continue;
    const id = `T${ids.size + 1}`;
    ids.set(id, t.tabId);
    const title = stripUrls(cleanTitle(t.title)).slice(0, MAX_TITLE) || 'Untitled';
    lines.push(`${id}: ${title}`);
  }
  let user = `Tabs:\n${lines.join('\n')}`;
  const line = userLine?.trim();
  if (line) user += `\n\nWhat the person wants to look at tomorrow: ${stripUrls(line).slice(0, 300)}`;
  return { token: newId(), deadline: clock.now() + timeoutMs, ids, system: SYSTEM, user };
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'work';
}

function rulesOnly(tabs: readonly TabSnapshot[], reason: GroupingFailure, sent?: string): GroupingOutcome {
  return { groups: groupTabs(tabs), applied: false, reason, sent };
}

/** Validates an answer against the request it belongs to. Never throws. */
export function parseGroupingAnswer(
  text: string,
  req: GroupingRequest,
  currentToken: string,
  tabs: readonly TabSnapshot[],
  clock: Clock,
): GroupingOutcome {
  const sent = `${req.system}\n\n${req.user}`;
  if (req.token !== currentToken) return rulesOnly(tabs, 'stale', sent);
  if (clock.now() > req.deadline) return rulesOnly(tabs, 'late', sent);
  const data = extractJson(text) as { groups?: unknown } | null;
  if (!data || !Array.isArray(data.groups)) return rulesOnly(tabs, 'unparseable', sent);

  const used = new Set<number>();
  const byKey = new Map<string, WorkGroup>();
  for (const g of data.groups as unknown[]) {
    if (!g || typeof g !== 'object') continue;
    const { name, ids } = g as { name?: unknown; ids?: unknown };
    if (typeof name !== 'string' || !Array.isArray(ids)) continue;
    const clean = shortName(stripUrls(name));
    if (!clean) continue;
    const tabIds: number[] = [];
    for (const id of ids) {
      if (typeof id !== 'string') continue;
      const tabId = req.ids.get(id);
      if (tabId === undefined || used.has(tabId)) continue;
      used.add(tabId);
      tabIds.push(tabId);
    }
    if (!tabIds.length) continue;
    const key = `llm:${slug(clean)}`;
    const existing = byKey.get(key);
    if (existing) existing.tabIds.push(...tabIds);
    else byKey.set(key, { key, name: clean, tabIds, source: 'llm' });
  }
  if (!byKey.size) return rulesOnly(tabs, 'unparseable', sent);

  const leftovers = tabs.filter((t) => !used.has(t.tabId));
  return { groups: [...byKey.values(), ...groupTabs(leftovers)], applied: true, sent };
}

/** Asks the transport once; any failure, slowness or bad answer falls back to the rules. */
export async function groupWithLlm(
  tabs: readonly TabSnapshot[],
  userLine: string | null,
  excludedDomains: readonly string[],
  transport: LlmTransport,
  clock: Clock,
  timeoutMs = DEFAULT_LLM_TIMEOUT_MS,
): Promise<GroupingOutcome> {
  const allowed = tabs.filter((t) => !isExcluded(t.url, excludedDomains));
  const req = buildGroupingRequest(allowed, userLine, excludedDomains, clock, timeoutMs);
  const sent = `${req.system}\n\n${req.user}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((res) => {
    timer = setTimeout(() => res('timeout'), timeoutMs);
  });
  try {
    const answer = await Promise.race([transport({ system: req.system, user: req.user }), timeout]);
    if (answer === 'timeout') return rulesOnly(allowed, 'timeout', sent);
    return parseGroupingAnswer(answer, req, req.token, allowed, clock);
  } catch {
    return rulesOnly(allowed, 'error', sent);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
