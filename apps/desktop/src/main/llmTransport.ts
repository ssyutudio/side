// The one place Side talks to the LLM. On by default (Director correction); off in Settings sends nothing.
// Two ways out: Side Pro goes through Side's server (proxyTransport), which holds the Claude key and
// checks the license; a developer key in .env.local goes straight to Anthropic (llmFromKey).
// It sends what the core modules built (tab titles with temporary ids, the user's own line) and
// refuses anything that looks like a web address, as a second guard behind the core checks.
import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_LLM_MODEL, DEFAULT_LLM_TIMEOUT_MS, type LlmConfig } from './config';

/** The slice of the SDK client this module uses, so tests can pass a fake. */
export interface MessagesClient {
  beta: {
    messages: {
      create(params: unknown, opts?: { signal?: AbortSignal }): Promise<unknown>;
    };
  };
}

export interface LlmTransport {
  complete(req: { system: string; prompt: string; maxTokens?: number }): Promise<string>;
}

/** What the transport is built with: the timeout always, the model when it differs from the default. */
export interface LlmOptions {
  timeoutMs: number;
  model?: string;
}

const URL_LIKE = /(https?:\/\/|www\.)/i;

export function containsUrl(text: string): boolean {
  return URL_LIKE.test(text);
}

interface ReplyShape {
  stop_reason?: string | null;
  content?: { type: string; text?: string }[];
}

export function createLlmTransport(client: MessagesClient, opts: LlmOptions): LlmTransport {
  const model = opts.model ?? DEFAULT_LLM_MODEL;
  return {
    async complete({ system, prompt, maxTokens = 2000 }) {
      if (containsUrl(system) || containsUrl(prompt)) {
        throw new Error('Refused to send: the request contained a URL.');
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
      try {
        const reply = (await client.beta.messages.create(
          {
            model,
            max_tokens: maxTokens,
            // Short classification-style work: low effort keeps it quick.
            output_config: { effort: 'low' },
            // Server-side fallback if the model declines.
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            system,
            messages: [{ role: 'user', content: prompt }],
          },
          { signal: controller.signal },
        )) as ReplyShape;
        if (reply.stop_reason === 'refusal') throw new Error('The model declined this request.');
        const text = (reply.content ?? [])
          .filter((b) => b.type === 'text' && typeof b.text === 'string')
          .map((b) => b.text)
          .join('');
        if (!text) throw new Error('The model returned no text.');
        return text;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * The SDK client for one key. A base URL points it at an Anthropic-compatible endpoint instead of
 * Anthropic itself, which is how one line switches the app to our own server when there is one.
 */
export function anthropicClient(apiKey: string, baseUrl: string | null = null): MessagesClient {
  const client = new Anthropic({ apiKey, maxRetries: 0, ...(baseUrl ? { baseURL: baseUrl } : {}) });
  return client as unknown as MessagesClient;
}

/** Builds the real transport from the main-process key and the resolved settings. Null without a key. */
export function llmFromKey(apiKey: string | null, options: Partial<LlmConfig> = {}): LlmTransport | null {
  if (!apiKey) return null;
  const client = anthropicClient(apiKey, options.baseUrl ?? null);
  return createLlmTransport(client, { timeoutMs: options.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS, model: options.model });
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Side Pro: the same request, sent to Side's server with this Mac's license. A 401/402 means the
 * license is not Pro any more (onRefused flips this Mac back to simple rules); every failure throws,
 * and the callers fall back to their rules as they do for any Claude failure.
 */
export function createProxyTransport(opts: {
  endpoint: string;
  credentials: () => { key: string; instanceId: string } | null;
  fetch: Fetch;
  timeoutMs: number;
  onRefused: (licenseStatus: string | undefined) => void;
}): LlmTransport {
  return {
    async complete({ system, prompt, maxTokens = 2000 }) {
      if (containsUrl(system) || containsUrl(prompt)) {
        throw new Error('Refused to send: the request contained a URL.');
      }
      const cred = opts.credentials();
      if (!cred) throw new Error('Side Pro is not active on this Mac.');
      const res = await opts.fetch(opts.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cred.key}`, 'x-side-instance': cred.instanceId },
        body: JSON.stringify({ system, prompt, maxTokens }),
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; text?: string; reason?: string; license?: string };
      if (res.status === 401 || res.status === 402) opts.onRefused(body.license);
      if (!res.ok || typeof body.text !== 'string' || !body.text) throw new Error(body.reason ?? `Side's server answered ${res.status}.`);
      return body.text;
    },
  };
}
