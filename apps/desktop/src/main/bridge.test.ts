import WebSocket from 'ws';
import { Bridge, type BridgeStatus } from './bridge';
import { makeMessage, encodeMessage, parseMessage, type Message } from '@side/shared';

const EXT_A = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const EXT_B = 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba';

const report = {
  tabs: [],
  skipped: { excluded: 0, excludedByDomain: {}, incognito: 0, internal: 0 },
  capturedAt: 1,
};

function setup(opts: { pinned?: string | null; timeoutMs?: number } = {}) {
  let pinned = opts.pinned ?? null;
  const statuses: BridgeStatus[] = [];
  const reports: unknown[] = [];
  const bridge = new Bridge({
    host: '127.0.0.1',
    port: 0,
    appVersion: '0.1.0',
    timeoutMs: opts.timeoutMs ?? 300,
    getPinnedOrigin: () => pinned,
    pinOrigin: (o) => {
      pinned = o;
    },
    getExclusions: () => ['client-bank.com'],
    onReport: (r) => reports.push(r),
    onStatus: (s) => statuses.push(s),
  });
  return { bridge, statuses, reports, pinnedNow: () => pinned };
}

function connect(port: number, origin?: string): Promise<{ ws: WebSocket; inbox: Message[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, origin ? { origin } : {});
    const inbox: Message[] = [];
    ws.on('message', (data) => {
      const r = parseMessage(String(data));
      if (r.ok) inbox.push(r.msg);
    });
    ws.on('open', () => resolve({ ws, inbox }));
    ws.on('error', reject);
    ws.on('unexpected-response', (_req, res) => reject(new Error(`http ${res.statusCode}`)));
  });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 1000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error('timed out waiting');
    await wait(10);
  }
}

describe('Bridge', () => {
  let ctx: ReturnType<typeof setup>;
  afterEach(async () => {
    await ctx?.bridge.stop();
  });

  it('pins the first extension origin and answers hello with welcome, exclusions, the language and a tab request', async () => {
    ctx = setup();
    const port = await ctx.bridge.start();
    const { ws, inbox } = await connect(port, EXT_A);
    ws.send(encodeMessage(makeMessage('hello', { extVersion: '0.1.0' })));
    await until(() => inbox.length >= 4);
    expect(inbox.map((m) => m.type)).toEqual(['welcome', 'exclusions.set', 'lang.set', 'tabs.request']);
    expect(inbox[2].payload).toEqual({ lang: 'en' });
    const excl = inbox[1];
    expect(excl.type === 'exclusions.set' && (excl.payload as { domains: string[] }).domains).toEqual(['client-bank.com']);
    expect(ctx.pinnedNow()).toBe(EXT_A);
    expect(ctx.bridge.status).toBe('connected');
    ws.close();
  });

  it('rejects connections without an extension origin or from another extension', async () => {
    ctx = setup({ pinned: EXT_A });
    const port = await ctx.bridge.start();
    await expect(connect(port)).rejects.toThrow(/403/);
    await expect(connect(port, 'https://evil.example')).rejects.toThrow(/403/);
    await expect(connect(port, EXT_B)).rejects.toThrow(/403/);
  });

  it('ignores null, broken JSON and unknown types and stays alive', async () => {
    ctx = setup();
    const port = await ctx.bridge.start();
    const { ws, inbox } = await connect(port, EXT_A);
    ws.send('null');
    ws.send('{"id":');
    ws.send(JSON.stringify({ id: 'x', type: 'format.disk', payload: {} }));
    ws.send(encodeMessage(makeMessage('tabs.report', report)));
    await until(() => ctx.reports.length === 1);
    ws.send(encodeMessage(makeMessage('ping', {})));
    await until(() => inbox.some((m) => m.type === 'pong'));
    ws.close();
  });

  it('resolves a command with the extension result', async () => {
    ctx = setup();
    const port = await ctx.bridge.start();
    const { ws } = await connect(port, EXT_A);
    ws.on('message', (data) => {
      const r = parseMessage(String(data));
      if (r.ok && r.msg.type === 'cmd.wrapup.undo') {
        ws.send(encodeMessage(makeMessage('cmd.result', { ok: true, result: { ungrouped: [1], reopened: 2 } }, r.msg.id)));
      }
    });
    ws.send(encodeMessage(makeMessage('hello', { extVersion: '0.1.0' })));
    await until(() => ctx.bridge.status === 'connected');
    const out = await ctx.bridge.command('cmd.wrapup.undo', { setAsideId: 'sa1' });
    expect(out).toEqual({ status: 'ok', result: { ungrouped: [1], reopened: 2 } });
    ws.close();
  });

  it('reports a Chrome failure separately from a timeout', async () => {
    ctx = setup({ timeoutMs: 150 });
    const port = await ctx.bridge.start();
    const { ws } = await connect(port, EXT_A);
    let answer = true;
    ws.on('message', (data) => {
      const r = parseMessage(String(data));
      if (r.ok && r.msg.type === 'cmd.wrapup.undo' && answer) {
        ws.send(encodeMessage(makeMessage('cmd.result', { ok: false, error: { kind: 'chrome', message: 'No tab with id 4' } }, r.msg.id)));
      }
    });
    ws.send(encodeMessage(makeMessage('hello', { extVersion: '0.1.0' })));
    await until(() => ctx.bridge.status === 'connected');
    expect(await ctx.bridge.command('cmd.wrapup.undo', { setAsideId: 'sa1' })).toEqual({
      status: 'failed',
      error: { kind: 'chrome', message: 'No tab with id 4' },
    });
    answer = false;
    expect(await ctx.bridge.command('cmd.wrapup.undo', { setAsideId: 'sa1' })).toEqual({ status: 'unconfirmed', reason: 'timeout' });
    ws.close();
  });

  it('marks pending commands unconfirmed when the extension disconnects', async () => {
    ctx = setup({ timeoutMs: 2000 });
    const port = await ctx.bridge.start();
    const { ws } = await connect(port, EXT_A);
    ws.send(encodeMessage(makeMessage('hello', { extVersion: '0.1.0' })));
    await until(() => ctx.bridge.status === 'connected');
    const pending = ctx.bridge.command('cmd.wrapup.undo', { setAsideId: 'sa1' });
    ws.close();
    expect(await pending).toEqual({ status: 'unconfirmed', reason: 'disconnected' });
    await until(() => ctx.bridge.status === 'disconnected');
  });

  it('answers not_connected without sending when no extension is there', async () => {
    ctx = setup();
    await ctx.bridge.start();
    expect(ctx.bridge.status).toBe('waiting');
    expect(await ctx.bridge.command('tabs.request', {})).toEqual({ status: 'unconfirmed', reason: 'not_connected' });
  });

  it('accepts a reconnect from the same extension after the worker slept', async () => {
    ctx = setup();
    const port = await ctx.bridge.start();
    const first = await connect(port, EXT_A);
    first.ws.send(encodeMessage(makeMessage('hello', { extVersion: '0.1.0' })));
    await until(() => ctx.bridge.status === 'connected');
    first.ws.terminate();
    await until(() => ctx.bridge.status === 'disconnected');
    const second = await connect(port, EXT_A);
    second.ws.send(encodeMessage(makeMessage('hello', { extVersion: '0.1.0' })));
    await until(() => ctx.bridge.status === 'connected');
    expect(ctx.statuses).toEqual(['waiting', 'connected', 'disconnected', 'connected']);
    second.ws.close();
  });
  it('settles commands of a replaced connection as disconnected, not as a timeout', async () => {
    ctx = setup({ timeoutMs: 5000 });
    const port = await ctx.bridge.start();
    const first = await connect(port, EXT_A);
    first.ws.send(encodeMessage(makeMessage('hello', { extVersion: '0.1.0' })));
    await until(() => ctx.bridge.status === 'connected');
    const pending = ctx.bridge.command('cmd.wrapup.undo', { setAsideId: 'sa1' });
    const second = await connect(port, EXT_A);
    second.ws.send(encodeMessage(makeMessage('hello', { extVersion: '0.1.0' })));
    expect(await pending).toEqual({ status: 'unconfirmed', reason: 'disconnected' });
    second.ws.close();
  });

  it('takes a per-call timeout and keeps the default for other commands', async () => {
    ctx = setup({ timeoutMs: 80 });
    const port = await ctx.bridge.start();
    const { ws } = await connect(port, EXT_A);
    ws.send(encodeMessage(makeMessage('hello', { extVersion: '0.1.0' })));
    await until(() => ctx.bridge.status === 'connected');
    const started = Date.now();
    const long = ctx.bridge.command('cmd.wrapup.undo', { setAsideId: 'sa1' }, 400);
    expect(await ctx.bridge.command('cmd.wrapup.undo', { setAsideId: 'sa2' })).toEqual({ status: 'unconfirmed', reason: 'timeout' });
    expect(Date.now() - started).toBeLessThan(300);
    expect(await long).toEqual({ status: 'unconfirmed', reason: 'timeout' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(380);
    ws.close();
  });

  it('remembers only the last 200 timed-out command ids', async () => {
    ctx = setup({ timeoutMs: 1 });
    const port = await ctx.bridge.start();
    const { ws } = await connect(port, EXT_A);
    ws.send(encodeMessage(makeMessage('hello', { extVersion: '0.1.0' })));
    await until(() => ctx.bridge.status === 'connected');
    for (let i = 0; i < 230; i++) await ctx.bridge.command('tabs.request', {});
    expect((ctx.bridge as unknown as { expired: Set<string> }).expired.size).toBe(200);
    ws.close();
  });

  it('warns, without the contents, when a frame is dropped', async () => {
    ctx = setup();
    const port = await ctx.bridge.start();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { ws, inbox } = await connect(port, EXT_A);
    ws.send(JSON.stringify({ id: 'x', type: 'tabs.report', payload: { secret: 'https://private.example/page' } }));
    ws.send(encodeMessage(makeMessage('ping', {})));
    await until(() => inbox.some((m) => m.type === 'pong'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('bad payload for tabs.report');
    expect(String(warn.mock.calls[0][0])).not.toContain('private.example');
    warn.mockRestore();
    ws.close();
  });
});
