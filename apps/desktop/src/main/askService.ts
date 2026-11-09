// Ask sidy, in the main process: one line → one decision from core/askSidy. Claude is asked only
// while AI drafting is on and a key exists; otherwise (or on error, refusal or a slow answer) the
// word rules decide. Only the newest ask counts: an older one that finishes later is marked stale
// and the screen ignores it. The same line asked again while the first is still out shares it, so
// one line never acts twice.
import type { JsonStore } from './store';
import type { AppData } from './appData';
import type { Clock } from '../core/clock';
import type { LlmTransport } from '../core/llmGrouping';
import { askOnce } from '../core/llmHelp';
import { buildAskRequest, cleanAsk, decideByWords, detectCrisis, parseAsk, type AskDecision } from '../core/askSidy';

export const ASK_TIMEOUT_MS = 6000;

export type AskReply = { decision: AskDecision; latest: boolean } | { error: 'empty' };

export class AskService {
  private seq = 0;
  private inflight = new Map<string, { n: number; p: Promise<AskDecision> }>();

  constructor(private readonly deps: { store: JsonStore<AppData>; clock: Clock; llm: LlmTransport | null; timeoutMs?: number }) {}

  async ask(raw: unknown): Promise<AskReply> {
    const line = cleanAsk(raw);
    if (!line) return { error: 'empty' };
    const same = this.inflight.get(line);
    const n = same ? same.n : ++this.seq;
    const p = same ? same.p : this.decide(line);
    if (!same) this.inflight.set(line, { n, p });
    try {
      const decision = await p;
      return { decision, latest: n === this.seq };
    } finally {
      if (this.inflight.get(line)?.n === n) this.inflight.delete(line);
    }
  }

  private async decide(line: string): Promise<AskDecision> {
    // A crisis sentence never waits on a model.
    if (detectCrisis(line)) return { kind: 'crisis', by: 'words' };
    const { settings } = this.deps.store.get();
    if (!settings.llmEnabled || !this.deps.llm) return decideByWords(line);
    const at = this.deps.clock.now();
    await this.deps.store
      .update((d) => ({ ...d, llmLog: [...d.llmLog, { at, titles: 0, userLine: true }].slice(-50) }))
      .catch(() => undefined);
    const text = await askOnce(this.deps.llm, buildAskRequest(line), this.deps.timeoutMs ?? ASK_TIMEOUT_MS);
    return parseAsk(text, line) ?? decideByWords(line);
  }
}
