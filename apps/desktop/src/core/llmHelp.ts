// Claude's small helps beyond grouping (Director 3-A): two questions for tomorrow at night, and in
// the morning picking the one tab or file that matches the user's own line (L1: across tools). What
// is sent: group names, tab titles and file names (no folder) with temporary ids, the user's line.
// Never URLs, paths, page text, file contents or excluded sites. Answers can only pick from what was
// sent; a failure, a refusal or a late answer falls back to the rules.
import type { SavedFile, SavedTab, SetAside, Step } from '@side/shared';
import { isExcluded, newId as defaultNewId } from '@side/shared';
import type { Clock } from './clock';
import { stripAddresses } from './addresses';
import type { LlmTransport } from './llmGrouping';
import { BREAKS_KEY, cleanTitle, shortName } from './grouping';
import { checkStep } from './step';
import { language, t } from '../i18n';
import { KO_ADVICE } from '../i18n/ko/core';
import { step as stepCopy } from './copy';

export const HELP_TIMEOUT_MS = 6000;
const MAX_SUGGESTION = 70;
const ADVICE = /\b(should|must|need to|sleep|health|diagnos|adhd|anxiety|depress|therapy)\b/i;

export { stripAddresses };

export interface LlmRequest {
  system: string;
  user: string;
}

/** Asks once. Null on error, refusal or when the deadline passes; a late answer is ignored. */
export async function askOnce(transport: LlmTransport, req: LlmRequest, timeoutMs = HELP_TIMEOUT_MS): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((r) => {
    timer = setTimeout(() => r(null), timeoutMs);
  });
  try {
    return await Promise.race([transport(req).catch(() => null), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function jsonOf(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ---- night: two questions for tomorrow ----

export function buildSuggestRequest(groupNames: readonly string[]): LlmRequest {
  const names = groupNames.map((n) => stripAddresses(n).slice(0, 40)).filter(Boolean).slice(0, 12);
  return {
    system:
      'A person is stopping work for the night. From the names of the work groups they set aside, write two short questions ' +
      'they might be curious about tomorrow. ' +
      t('Plain English, each under 70 characters, each ending with "?". ') +
      'No advice, no instructions, nothing about sleep or health. Reply with JSON only: {"suggestions":["...","..."]}.',
    user: `Work groups:\n${names.map((n) => `- ${n}`).join('\n')}`,
  };
}

export function parseSuggestions(text: string): string[] {
  const data = jsonOf(text) as { suggestions?: unknown } | null;
  if (!data || !Array.isArray(data.suggestions)) return [];
  const out: string[] = [];
  for (const raw of data.suggestions) {
    if (typeof raw !== 'string') continue;
    const s = raw.trim().replace(/\s+/g, ' ');
    if (s.length < (language() === 'ko' ? 4 : 8) || s.length > MAX_SUGGESTION || !s.endsWith('?')) continue;
    if (stripAddresses(s) !== s || ADVICE.test(s) || (language() === 'ko' && KO_ADVICE.test(s))) continue;
    if (!out.includes(s)) out.push(s);
    if (out.length === 2) break;
  }
  return out;
}

// ---- morning: the tab that matches the user's own line ----

/** What a temporary id stands for: a saved tab, or a saved file in a desktop app. */
export type RecallTarget = { kind: 'tab'; tabId: number } | { kind: 'file'; workId: string };

export interface RecallRequest extends LlmRequest {
  /** Temporary id -> what it names; the only way an answer can name a tab or a file. */
  ids: Map<string, RecallTarget>;
}

/** A file name as it may be sent: no folder, no address, short. */
export function sendableFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  return stripAddresses(base).slice(0, 80);
}

export function buildRecallRequest(
  line: string,
  tabs: readonly SavedTab[],
  excludedDomains: readonly string[],
  files: readonly SavedFile[] = [],
): RecallRequest {
  const ids = new Map<string, RecallTarget>();
  const rows: string[] = [];
  let t = 0;
  for (const tab of tabs) {
    if (isExcluded(tab.url, excludedDomains)) continue;
    const title = stripAddresses(cleanTitle(tab.title) || tab.title).slice(0, 120) || 'Untitled';
    const id = `T${++t}`;
    ids.set(id, { kind: 'tab', tabId: tab.tabId });
    rows.push(`${id}: ${title}`);
  }
  const fileRows: string[] = [];
  let f = 0;
  for (const file of files) {
    const name = sendableFileName(file.name);
    if (!name) continue;
    const id = `F${++f}`;
    ids.set(id, { kind: 'file', workId: file.workId });
    fileRows.push(`${id}: ${name} (${file.tool})`);
  }
  return {
    ids,
    system:
      'Last night a person wrote one line about what they are curious about. Pick the ONE tab or file that best matches it, ' +
      'so it can be reopened for them. Reply with JSON only: {"id":"T1"}. Use only an id from the lists.',
    user: `Their line: ${stripAddresses(line).slice(0, 200)}\nTabs:\n${rows.join('\n')}${fileRows.length ? `\nFiles:\n${fileRows.join('\n')}` : ''}`,
  };
}

export function parseRecall(text: string, ids: ReadonlyMap<string, RecallTarget>): RecallTarget | null {
  const data = jsonOf(text) as { id?: unknown } | null;
  if (!data || typeof data.id !== 'string') return null;
  return ids.get(data.id.trim()) ?? null;
}

// ---- the step for a picked tab, held to the same four conditions as every step ----


export function stepForTab(
  sa: SetAside,
  tabId: number,
  excludedDomains: readonly string[],
  clock: Clock,
  newId: () => string = defaultNewId,
): Step | null {
  const t = sa.tabs.find((x) => x.tabId === tabId);
  if (!t || t.groupKey === BREAKS_KEY) return null;
  const work = shortName(sa.groups.find((g) => g.key === t.groupKey)?.name || cleanTitle(t.title) || t.title);
  const draft: Step = {
    id: newId(),
    fromSetAside: sa.id,
    createdAt: clock.now(),
    label: stepCopy.label(work, sa.userLine, t.position !== null),
    action: { type: 'open_url', url: t.url, title: t.title, position: t.position },
    checks: { noJudgment: false, cannotFail: false, inRealTool: false, resultVisible: false },
    source: 'llm',
  };
  const { ok, checks } = checkStep(draft, excludedDomains);
  return ok ? { ...draft, checks } : null;
}
