import { anthropicClient, containsUrl, createLlmTransport, llmFromKey, type MessagesClient } from './llmTransport';

function fakeClient(reply: unknown, delayMs = 0): MessagesClient & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    beta: {
      messages: {
        create: async (params: unknown, opts?: { signal?: AbortSignal }) => {
          calls.push(params);
          await new Promise((resolve, reject) => {
            const t = setTimeout(resolve, delayMs);
            opts?.signal?.addEventListener('abort', () => {
              clearTimeout(t);
              reject(new Error('aborted'));
            });
          });
          return reply;
        },
      },
    },
  } as MessagesClient & { calls: unknown[] };
}

const ok = { stop_reason: 'end_turn', content: [{ type: 'text', text: '{"groups":[]}' }] };

describe('containsUrl', () => {
  it('spots web addresses', () => {
    expect(containsUrl('see https://bank.example/x')).toBe(true);
    expect(containsUrl('www.bank.example')).toBe(true);
    expect(containsUrl('T1: Retry design doc')).toBe(false);
  });
});

describe('createLlmTransport', () => {
  it('returns the text of the answer', async () => {
    const client = fakeClient(ok);
    const llm = createLlmTransport(client, { timeoutMs: 1000 });
    expect(await llm.complete({ system: 's', prompt: 'T1: Retry design doc' })).toBe('{"groups":[]}');
    const params = client.calls[0] as { model: string; output_config: { effort: string } };
    expect(params.model).toBe('claude-opus-5-5');
    expect(params.output_config.effort).toBe('low');
  });

  it('asks the model it was given when the settings name one', async () => {
    const client = fakeClient(ok);
    const llm = createLlmTransport(client, { timeoutMs: 1000, model: 'claude-haiku-9' });
    await llm.complete({ system: 's', prompt: 'T1: x' });
    expect((client.calls[0] as { model: string }).model).toBe('claude-haiku-9');
  });

  it('refuses to send a prompt that contains a URL', async () => {
    const client = fakeClient(ok);
    const llm = createLlmTransport(client, { timeoutMs: 1000 });
    await expect(llm.complete({ system: 's', prompt: 'T1: https://bank.example/acct' })).rejects.toThrow(/URL/);
    expect(client.calls).toHaveLength(0);
  });

  it('gives up after the timeout so the rules can take over', async () => {
    const llm = createLlmTransport(fakeClient(ok, 500), { timeoutMs: 50 });
    await expect(llm.complete({ system: 's', prompt: 'T1: x' })).rejects.toThrow();
  });

  it('treats a refusal as a failure, not an answer', async () => {
    const llm = createLlmTransport(fakeClient({ stop_reason: 'refusal', content: [] }), { timeoutMs: 1000 });
    await expect(llm.complete({ system: 's', prompt: 'T1: x' })).rejects.toThrow(/declined/);
  });
});

describe('llmFromKey', () => {
  it('builds nothing without a key', () => {
    expect(llmFromKey(null, { model: 'claude-haiku-9', baseUrl: 'https://ai.example', timeoutMs: 1000 })).toBeNull();
  });

  it('builds a transport when there is a key', () => {
    const llm = llmFromKey('sk-test', { timeoutMs: 1000 });
    expect(llm).not.toBeNull();
    expect(typeof llm?.complete).toBe('function');
  });

  it('sends the client to our own endpoint only when one is set', () => {
    const proxied = anthropicClient('sk-test', 'https://ai.side.example/v1') as unknown as { baseURL: string };
    expect(proxied.baseURL).toContain('ai.side.example');

    const direct = anthropicClient('sk-test') as unknown as { baseURL: string };
    expect(direct.baseURL).toContain('anthropic');
  });
});
