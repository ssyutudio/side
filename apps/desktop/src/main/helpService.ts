// Claude's small helps around a Wrap up (Director 3-A), each with a rule fallback:
// - suggest(): two questions for tomorrow from the set-aside group names (cached per wrap-up);
// - recall(): in the morning, the one tab that matches the user's own line (ids it was sent only).
// Nothing is sent when the LLM is off or there is no key. Each send is logged by count only.
import type { JsonStore } from './store';
import type { AppData } from './appData';
import type { Clock } from '../core/clock';
import type { LlmTransport } from '../core/llmGrouping';
import { askOnce, buildRecallRequest, buildSuggestRequest, HELP_TIMEOUT_MS, parseRecall, parseSuggestions, stepForTab } from '../core/llmHelp';
import { buildBySideRequest, bySideCounts, bySideKey, LEARN_AFTER, parseBySide, ruleBySide } from '../core/llmHelpBySide';
import type { SideNumbers } from '../core/stats';

export type RecallOutcome = 'replaced' | 'kept' | 'skipped';

export interface BySide {
  text: string;
  byClaude: boolean;
}

export class HelpService {
  private suggestions = new Map<string, string[]>();
  private bySide: { key: string; text: string } | null = null;
  private bySideAsked = new Set<string>();

  constructor(private readonly deps: { store: JsonStore<AppData>; clock: Clock; llm: LlmTransport | null; timeoutMs?: number }) {}

  private get on(): boolean {
    return !!this.deps.llm && this.deps.store.get().settings.llmEnabled;
  }

  private async log(titles: number, userLine: boolean) {
    const at = this.deps.clock.now();
    await this.deps.store
      .update((d) => ({ ...d, llmLog: [...d.llmLog, { at, titles, userLine }].slice(-50) }))
      .catch(() => undefined);
  }

  /** Two short questions for tomorrow, or none (never invented by rule). */
  async suggest(setAsideId: string): Promise<string[]> {
    const cached = this.suggestions.get(setAsideId);
    if (cached) return cached;
    if (!this.on) return [];
    const sa = this.deps.store.get().setAsides.find((s) => s.id === setAsideId);
    if (!sa || !sa.groups.length) return [];
    const req = buildSuggestRequest(sa.groups.map((g) => g.name));
    await this.log(0, false);
    const text = await askOnce(this.deps.llm!, req, this.deps.timeoutMs ?? HELP_TIMEOUT_MS);
    const out = text ? parseSuggestions(text) : [];
    if (out.length) this.suggestions.set(setAsideId, out);
    return out;
  }

  /** Re-picks the next step's tab from the user's line. Keeps the rule step on any doubt. */
  async recall(setAsideId: string): Promise<RecallOutcome> {
    const d = this.deps.store.get();
    const sa = d.setAsides.find((s) => s.id === setAsideId);
    if (!this.on || !sa || !sa.userLine) return 'skipped';
    const req = buildRecallRequest(sa.userLine, sa.tabs, d.settings.excludedDomains);
    if (!req.ids.size) return 'skipped';
    await this.log(req.ids.size, true);
    const text = await askOnce(this.deps.llm!, req, this.deps.timeoutMs ?? HELP_TIMEOUT_MS);
    const tabId = text ? parseRecall(text, req.ids) : null;
    if (tabId === null) return 'kept';

    const now = this.deps.store.get();
    const current = now.steps.find((s) => s.fromSetAside === setAsideId);
    // A step the user has already seen stays as it is.
    if (current && now.stepEvents.some((e) => e.stepId === current.id && (e.shownAt !== null || e.clickedAt !== null))) return 'kept';
    if (current && current.action.type === 'open_url' && current.action.url === sa.tabs.find((t) => t.tabId === tabId)?.url) return 'kept';
    const fresh = stepForTab(sa, tabId, now.settings.excludedDomains, this.deps.clock);
    if (!fresh) return 'kept';
    await this.deps.store.update((x) => ({ ...x, steps: [...x.steps.filter((s) => s.fromSetAside !== setAsideId), fresh] }));
    return 'replaced';
  }

  /**
   * The By your side sentence for these counts. Returns at once (rule sentence or the cached
   * Claude sentence); when the counts changed it asks Claude once in the background and calls
   * onUpdate if a valid sentence came back. Never called on every state push for the same counts.
   */
  bySideFor(n: SideNumbers, onUpdate?: () => void): BySide {
    const c = bySideCounts(n);
    const key = bySideKey(c);
    if (c.opened < LEARN_AFTER || !this.on) return { text: ruleBySide(n), byClaude: false };
    if (this.bySide?.key === key) return { text: this.bySide.text, byClaude: true };
    if (!this.bySideAsked.has(key)) {
      this.bySideAsked.add(key);
      void (async () => {
        await this.log(0, false);
        const text = await askOnce(this.deps.llm!, buildBySideRequest(c), this.deps.timeoutMs ?? HELP_TIMEOUT_MS);
        const sentence = text ? parseBySide(text, c) : null;
        if (sentence) {
          this.bySide = { key, text: sentence };
          onUpdate?.();
        }
      })();
    }
    return { text: ruleBySide(n), byClaude: false };
  }
}
