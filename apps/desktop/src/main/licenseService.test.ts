import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore } from './store';
import { defaultAppData, type AppData } from './appData';
import { LicenseService, OFFLINE_GRACE_MS } from './licenseService';
import { createProxyTransport } from './llmTransport';

const KEY = '38B1460A-5104-4067-A91D-77B872934D51';

async function setup(answer: (body: any) => { status: number; body: unknown } | 'down') {
  const store = new JsonStore<AppData>(join(mkdtempSync(join(tmpdir(), 'side-lic-')), 'd.json'), defaultAppData);
  await store.load();
  let now = 1_800_000_000_000;
  const sent: any[] = [];
  const fetchFn = async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    sent.push(body);
    const a = answer(body);
    if (a === 'down') throw new Error('offline');
    return new Response(JSON.stringify(a.body), { status: a.status });
  };
  const svc = new LicenseService({ store, now: () => now, fetch: fetchFn, seal: (s) => `sealed:${s}`, unseal: (s) => (s.startsWith('sealed:') ? s.slice(7) : null) });
  return { store, svc, sent, tick: (ms: number) => (now += ms) };
}

const activated = { status: 200, body: { ok: true, instanceId: 'inst-1', status: 'active', expiresAt: '2027-01-15T00:00:00Z', plan: 'Monthly' } };

describe('LicenseService', () => {
  it('is free until a key is activated, then Pro with the key sealed', async () => {
    const { store, svc, sent } = await setup(() => activated);
    expect(svc.view().state).toBe('free');
    expect(svc.credentials()).toBeNull();
    expect(await svc.activate(` ${KEY} `)).toEqual({ ok: true });
    expect(sent[0]).toEqual({ action: 'activate', licenseKey: KEY, instanceName: store.get().installId });
    expect(store.get().license).toMatchObject({ sealedKey: `sealed:${KEY}`, instanceId: 'inst-1', plan: 'Monthly' });
    expect(JSON.stringify(store.get())).not.toContain(`"${KEY}"`);
    expect(svc.view()).toEqual({ state: 'pro', plan: 'Monthly', renewsAt: Date.parse('2027-01-15T00:00:00Z') });
    expect(svc.credentials()).toEqual({ key: KEY, instanceId: 'inst-1' });
  });

  it('keeps nothing when the server rejects the key', async () => {
    const { store, svc } = await setup(() => ({ status: 400, body: { ok: false, reason: 'This license key is not for Side.' } }));
    expect(await svc.activate(KEY)).toEqual({ ok: false, reason: 'rejected', detail: 'This license key is not for Side.' });
    expect(store.get().license ?? null).toBeNull();
  });

  it('says unreachable when the server cannot be reached', async () => {
    const { svc } = await setup(() => 'down');
    expect(await svc.activate(KEY)).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('ends Pro when a refresh says the subscription expired', async () => {
    let answer: any = activated;
    const { svc } = await setup(() => answer);
    await svc.activate(KEY);
    answer = { status: 200, body: { ok: true, status: 'expired', expiresAt: null, plan: 'Monthly' } };
    await svc.refresh();
    expect(svc.view().state).toBe('ended');
    expect(svc.credentials()).toBeNull();
  });

  it('stays Pro offline for the grace period, then stops', async () => {
    let down = false;
    const { svc, tick } = await setup(() => (down ? 'down' : activated));
    await svc.activate(KEY);
    down = true;
    tick(OFFLINE_GRACE_MS - 1000);
    await svc.refresh();
    expect(svc.pro()).toBe(true);
    tick(2000);
    expect(svc.pro()).toBe(false);
  });

  it('forgets the key on sign out, even when the server is unreachable', async () => {
    let down = false;
    const { store, svc } = await setup(() => (down ? 'down' : activated));
    await svc.activate(KEY);
    down = true;
    expect(await svc.deactivate()).toEqual({ ok: false, reason: 'unreachable' });
    expect(store.get().license).toBeNull();
    expect(svc.view().state).toBe('free');
  });

  it('shows developer mode when a developer key is set', async () => {
    const store = new JsonStore<AppData>(join(mkdtempSync(join(tmpdir(), 'side-lic-')), 'd.json'), defaultAppData);
    await store.load();
    const svc = new LicenseService({ store, now: () => 0, fetch: async () => new Response('{}'), seal: (s) => s, unseal: (s) => s, developer: true });
    expect(svc.view().state).toBe('developer');
  });
});

describe('proxy transport', () => {
  const cred = { key: KEY, instanceId: 'inst-1' };

  it('sends the request with the license headers and returns the text', async () => {
    let seen: RequestInit | undefined;
    const t = createProxyTransport({
      endpoint: 'https://side.example/api/llm', credentials: () => cred, timeoutMs: 1000, onRefused: () => undefined,
      fetch: async (_u, init) => ((seen = init), new Response(JSON.stringify({ ok: true, text: 'hi' }))),
    });
    expect(await t.complete({ system: 's', prompt: 'p' })).toBe('hi');
    expect((seen!.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(String(seen!.body))).toEqual({ system: 's', prompt: 'p', maxTokens: 2000 });
  });

  it('reports a 402 so the Mac goes back to rules, and throws', async () => {
    const refused: (string | undefined)[] = [];
    const t = createProxyTransport({
      endpoint: 'x', credentials: () => cred, timeoutMs: 1000, onRefused: (s) => refused.push(s),
      fetch: async () => new Response(JSON.stringify({ ok: false, license: 'expired', reason: 'no' }), { status: 402 }),
    });
    await expect(t.complete({ system: 's', prompt: 'p' })).rejects.toThrow();
    expect(refused).toEqual(['expired']);
  });

  it('never sends without a license or with an address in it', async () => {
    let calls = 0;
    const fetchFn = async () => (calls++, new Response('{}'));
    const none = createProxyTransport({ endpoint: 'x', credentials: () => null, timeoutMs: 1000, onRefused: () => undefined, fetch: fetchFn });
    await expect(none.complete({ system: 's', prompt: 'p' })).rejects.toThrow();
    const pro = createProxyTransport({ endpoint: 'x', credentials: () => cred, timeoutMs: 1000, onRefused: () => undefined, fetch: fetchFn });
    await expect(pro.complete({ system: 's', prompt: 'see https://a.b' })).rejects.toThrow();
    expect(calls).toBe(0);
  });
});
