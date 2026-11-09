import { createLlmTransport, containsUrl, type MessagesClient } from './llmTransport';

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
