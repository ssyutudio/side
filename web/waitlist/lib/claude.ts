// The server's one call to Claude, on behalf of a Side Pro Mac. Same request the desktop app makes
// with a developer key: short classification-style work at low effort, with the server-side
// fallback if the model declines. The model is fixed here, not chosen by the caller.
import Anthropic from '@anthropic-ai/sdk';

export const LLM_MODEL = 'claude-opus-5-5';

/** The slice of the SDK client used here, so tests can pass a fake. */
export interface MessagesClient {
  beta: { messages: { create(params: unknown, opts?: { signal?: AbortSignal }): Promise<unknown> } };
}

interface ReplyShape {
  stop_reason?: string | null;
  content?: { type: string; text?: string }[];
}

export type ClaudeOutcome = { ok: true; text: string } | { ok: false; reason: string };

export async function complete(client: MessagesClient, req: { system: string; prompt: string; maxTokens: number }, timeoutMs = 8500): Promise<ClaudeOutcome> {
  try {
    const reply = (await client.beta.messages.create(
      {
        model: LLM_MODEL,
        max_tokens: req.maxTokens,
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
      },
      { signal: AbortSignal.timeout(timeoutMs) },
    )) as ReplyShape;
    if (reply.stop_reason === 'refusal') return { ok: false, reason: 'The model declined this request.' };
    const text = (reply.content ?? []).filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('');
    return text ? { ok: true, text } : { ok: false, reason: 'The model returned no text.' };
  } catch {
    return { ok: false, reason: 'Claude is not reachable right now.' };
  }
}

let cached: MessagesClient | null = null;

export function getClaude(env: Record<string, string | undefined> = process.env): MessagesClient {
  if (cached) return cached;
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Claude is not configured.');
  cached = new Anthropic({ apiKey, maxRetries: 0 }) as unknown as MessagesClient;
  return cached;
}
