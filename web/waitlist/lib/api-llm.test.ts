import { createLlmHandler } from '../api/llm.js';
import { DAILY_LLM_LIMIT, keyHash } from './entitlement.js';
import { createLemon, type Fetch } from './lemon.js';
import type { MessagesClient } from './claude.js';
import { fakeRes, fakeSql } from './testing.js';

const KEY = '38B1460A-5104-4067-A91D-77B872934D51';
const meta = { store_id: 11, product_id: 22, variant_name: 'Monthly' };

function lemonWith(body: unknown, status = 200) {
  let calls = 0;
  const fetchFn: Fetch = async () => {
    calls++;
    return new Response(JSON.stringify(body), { status });
  };
  return { lemon: createLemon({ storeId: 11, productId: 22 }, fetchFn), calls: () => calls };
}
const activeHere = { valid: true, license_key: { status: 'active', expires_at: null }, instance: { id: 'inst-1' }, meta };

function claude(text = '{"groups":[]}') {
  const sent: unknown[] = [];
  const client: MessagesClient = { beta: { messages: { create: async (p) => (sent.push(p), { stop_reason: 'end_turn', content: [{ type: 'text', text }] }) } } };
  return { client, sent };
}

const req = (body: unknown, headers: Record<string, string> = { authorization: `Bearer ${KEY}`, 'x-side-instance': 'inst-1' }) => ({ method: 'POST', headers, body });
const ask = { system: 'Name the groups.', prompt: 'T1: Retry backoff design' };

describe('llm handler', () => {
  it('checks the license, counts one request and answers with Claude text', async () => {
    const l = lemonWith(activeHere);
    const c = claude('hello');
    // 1: cache lookup (empty) 2: cache upsert 3: usage count
    const sql = fakeSql([[], [], [{ calls: 1 }]]);
    const res = fakeRes();
    await createLlmHandler({ lemon: () => l.lemon, sql: () => sql.tag, claude: () => c.client })(req(ask), res);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, text: 'hello' });
    expect(c.sent[0]).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 2000, system: ask.system, fallbacks: 'default' });
    // Only a hash of the key reaches the database, and no request text does.
    const values = sql.calls.flatMap((x) => x.values);
    expect(values).toContain(keyHash(KEY));
    expect(values).not.toContain(KEY);
    expect(values).not.toContain(ask.prompt);
  });

  it('uses a fresh cached check without asking Lemon Squeezy', async () => {
    const l = lemonWith(activeHere);
    const sql = fakeSql([[{ ok: true, status: 'active', checked_at: new Date() }], [{ calls: 3 }]]);
    const res = fakeRes();
    await createLlmHandler({ lemon: () => l.lemon, sql: () => sql.tag, claude: () => claude().client })(req(ask), res);
    expect(res.statusCode).toBe(200);
    expect(l.calls()).toBe(0);
  });

  it('answers 402 for an expired subscription and never calls Claude', async () => {
    const l = lemonWith({ ...activeHere, license_key: { status: 'expired', expires_at: null } });
    const c = claude();
    const sql = fakeSql([[], []]);
    const res = fakeRes();
    await createLlmHandler({ lemon: () => l.lemon, sql: () => sql.tag, claude: () => c.client })(req(ask), res);
    expect(res.statusCode).toBe(402);
    expect(res.json().license).toBe('expired');
    expect(c.sent).toHaveLength(0);
  });

  it('answers 402 when the key is activated on another Mac, not this one', async () => {
    const l = lemonWith({ ...activeHere, instance: null });
    const sql = fakeSql([[], []]);
    const res = fakeRes();
    await createLlmHandler({ lemon: () => l.lemon, sql: () => sql.tag, claude: () => claude().client })(req(ask), res);
    expect(res.statusCode).toBe(402);
  });

  it('answers 429 past the daily limit', async () => {
    const c = claude();
    const sql = fakeSql([[{ ok: true, status: 'active', checked_at: new Date() }], [{ calls: DAILY_LLM_LIMIT + 1 }]]);
    const res = fakeRes();
    await createLlmHandler({ lemon: () => lemonWith(activeHere).lemon, sql: () => sql.tag, claude: () => c.client })(req(ask), res);
    expect(res.statusCode).toBe(429);
    expect(c.sent).toHaveLength(0);
  });

  it('keeps a recent Pro Mac working while Lemon Squeezy is down', async () => {
    const l = lemonWith({}, 500);
    const sql = fakeSql([[{ ok: true, status: 'active', checked_at: new Date(Date.now() - 2 * 60 * 60_000) }], [{ calls: 1 }]]);
    const res = fakeRes();
    await createLlmHandler({ lemon: () => l.lemon, sql: () => sql.tag, claude: () => claude().client })(req(ask), res);
    expect(res.statusCode).toBe(200);
  });

  it('answers 401 without a license', async () => {
    const res = fakeRes();
    await createLlmHandler({ lemon: () => lemonWith(activeHere).lemon, sql: () => fakeSql([]).tag, claude: () => claude().client })(req(ask, {}), res);
    expect(res.statusCode).toBe(401);
  });

  it.each([
    [{ ...ask, prompt: 'T1: see https://example.com' }],
    [{ ...ask, model: 'claude-fable-5-2' }],
    [{ ...ask, maxTokens: 64000 }],
    [{ system: 'x', prompt: 'y'.repeat(48_001) }],
  ])('refuses %# with 400 before any check', async (body) => {
    const l = lemonWith(activeHere);
    const sql = fakeSql([]);
    const res = fakeRes();
    await createLlmHandler({ lemon: () => l.lemon, sql: () => sql.tag, claude: () => claude().client })(req(body), res);
    expect(res.statusCode).toBe(400);
    expect(sql.calls).toHaveLength(0);
    expect(l.calls()).toBe(0);
  });

  it('turns a Claude refusal into 502', async () => {
    const client: MessagesClient = { beta: { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } } };
    const sql = fakeSql([[{ ok: true, status: 'active', checked_at: new Date() }], [{ calls: 1 }]]);
    const res = fakeRes();
    await createLlmHandler({ lemon: () => lemonWith(activeHere).lemon, sql: () => sql.tag, claude: () => client })(req(ask), res);
    expect(res.statusCode).toBe(502);
  });
});
