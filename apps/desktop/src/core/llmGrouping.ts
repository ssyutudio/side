// LLM help for naming and grouping works (on by default per the Director; the user can turn it off).
// What leaves the Mac: tab titles with temporary ids (T1..Tn) and the user's own
// line. Never URLs, hosts or page text. The answer may only pick from those ids;
// anything else is dropped, leftovers go to the rules, and an answer that arrives
// after the deadline or for an older request is not applied automatically.
import type { TabSnapshot, WorkGroup } from '@side/shared';
import { isExcluded, newId } from '@side/shared';
import { stripAddresses } from './addresses';
import type { Clock } from './clock';
import { groupNames } from './copy';
import { t } from '../i18n';
import { BREAKS_KEY, cleanTitle, groupTabs, isBreaksName, shortName } from './grouping';

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

/** The grouping instructions. In Korean only the two sentences about names change; the reply format does not. */
function systemPrompt(): string {
  return (
    'You sort browser tabs into a few works so a person can set them aside for the night. ' +
    'You only see tab titles with ids. Reply with JSON only: {"groups":[{"name":"short work name","ids":["T1"]}]}. ' +
    'Use each id at most once. ' +
    t('Names are plain English, at most 40 characters, no emoji. ') +
    t('Put videos and social feeds in a group named "Breaks". ') +
    'Leave out ids you are unsure about.'
  );
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
    const title = stripAddresses(cleanTitle(t.title)).slice(0, MAX_TITLE) || 'Untitled';
    lines.push(`${id}: ${title}`);
  }
  let user = `Tabs:\n${lines.join('\n')}`;
  const line = userLine?.trim();
  if (line) user += `\n\nWhat the person wants to look at tomorrow: ${stripAddresses(line).slice(0, 300)}`;
  return { token: newId(), deadline: clock.now() + timeoutMs, ids, system: systemPrompt(), user };
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

/** Keeps letters and numbers of any script, so two Korean names stay two groups. Fits the 100-char key limit. */
function slug(name: string): string {
  const words = name.normalize('NFKC').toLowerCase().replace(/\+/g, 'plus').replace(/#/g, 'sharp');
  const s = words.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  // Nothing but symbols or emoji: use their code points so different names stay different.
  const key = s || [...words].map((c) => c.codePointAt(0)!.toString(16)).join('-') || 'work';
  return key.slice(0, 90);
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
    const clean = shortName(stripAddresses(name));
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
    // A group the model calls "Breaks" is the Breaks group, so no step is ever made from it.
    const isBreaks = isBreaksName(clean);
    const key = isBreaks ? BREAKS_KEY : `llm:${slug(clean)}`;
    const existing = byKey.get(key);
    if (existing) existing.tabIds.push(...tabIds);
    else byKey.set(key, { key, name: isBreaks ? groupNames.breaks : clean, tabIds, source: 'llm' });
  }
  if (!byKey.size) return rulesOnly(tabs, 'unparseable', sent);

  const leftovers = tabs.filter((t) => !used.has(t.tabId));
  // The rules' own Breaks group joins the model's one instead of showing up twice.
  const groups = [...byKey.values()];
  for (const g of groupTabs(leftovers)) {
    const same = groups.find((x) => x.key === g.key);
    if (same) same.tabIds.push(...g.tabIds);
    else groups.push(g);
  }
  return { groups, applied: true, sent };
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
