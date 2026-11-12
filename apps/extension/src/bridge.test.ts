import { Bridge, PROBE_TRUST_LIMIT, httpProbe } from './bridge';
import { FakeSocket } from './testing/fakeSocket';
import { BRIDGE_HOST, BRIDGE_PORT, KEEPALIVE_MS, RECONNECT_MIN_MS, RECONNECT_MAX_MS, makeMessage, encodeMessage } from '@side/shared';
import type { Message } from '@side/shared';

function setup() {
  const sockets: FakeSocket[] = [];
  const received: Message[] = [];
  const statuses: boolean[] = [];
  const bridge = new Bridge({
    createSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    extVersion: '0.1.0',
    onMessage: (m) => received.push(m),
    onStatus: (c) => statuses.push(c),
  });
  return { bridge, sockets, received, statuses, last: () => sockets[sockets.length - 1] };
}

describe('Bridge', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('connects to the local app port and says hello on open', () => {
    const { bridge, last, statuses } = setup();
    bridge.connect();
    expect(last().url).toBe(`ws://${BRIDGE_HOST}:${BRIDGE_PORT}`);
    last().open();
    expect(last().sentTypes()).toEqual(['hello']);
    expect(JSON.parse(last().sent[0]).payload).toEqual({ extVersion: '0.1.0' });
    expect(statuses).toEqual([true]);
  });

  it('pings every keepalive interval while open', () => {
    const { bridge, last } = setup();
    bridge.connect();
    last().open();
    vi.advanceTimersByTime(KEEPALIVE_MS * 3);
    expect(last().sentTypes().filter((t) => t === 'ping')).toHaveLength(3);
  });

  it('ignores null, broken JSON, unknown types and pongs; delivers valid messages', () => {
    const { bridge, last, received } = setup();
    bridge.connect();
    last().open();
    last().receive(null);
    last().receive('{"id":');
    last().receive(JSON.stringify({ id: 'x', type: 'erase.everything', payload: {} }));
    last().receive(encodeMessage(makeMessage('pong', {})));
    expect(received).toEqual([]);
    last().receive(encodeMessage(makeMessage('tabs.request', {})));
    expect(received.map((m) => m.type)).toEqual(['tabs.request']);
  });

  it('survives a throwing message handler', () => {
    const sockets: FakeSocket[] = [];
    const bridge = new Bridge({
      createSocket: (url) => {
        const s = new FakeSocket(url);
        sockets.push(s);
        return s;
      },
      extVersion: '0.1.0',
      onMessage: () => {
        throw new Error('boom');
      },
    });
    bridge.connect();
    sockets[0].open();
    expect(() => sockets[0].receive(encodeMessage(makeMessage('tabs.request', {})))).not.toThrow();
  });

  it('reconnects with growing backoff capped at the maximum, and resets after success', () => {
    const { bridge, sockets, last, statuses } = setup();
    bridge.connect();
    last().drop();
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(RECONNECT_MIN_MS);
    expect(sockets).toHaveLength(2);
    last().drop();
    vi.advanceTimersByTime(RECONNECT_MIN_MS);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(RECONNECT_MIN_MS);
    expect(sockets).toHaveLength(3);
    for (let i = 0; i < 10; i++) {
      last().drop();
      vi.advanceTimersByTime(RECONNECT_MAX_MS);
    }
    const before = sockets.length;
    last().drop();
    vi.advanceTimersByTime(RECONNECT_MAX_MS - 1);
    expect(sockets.length).toBe(before);
    vi.advanceTimersByTime(1);
    expect(sockets.length).toBe(before + 1);
    last().open();
    last().drop();
    vi.advanceTimersByTime(RECONNECT_MIN_MS);
    expect(sockets.length).toBe(before + 2);
    expect(statuses).toContain(false);
  });

  it('does not open a second socket while one is open or connecting', () => {
    const { bridge, sockets, last } = setup();
    bridge.connect();
    bridge.connect();
    expect(sockets).toHaveLength(1);
    last().open();
    bridge.connect();
    expect(sockets).toHaveLength(1);
  });

  it('reports send failure when not connected', () => {
    const { bridge, last } = setup();
    expect(bridge.send(makeMessage('ping', {}))).toBe(false);
    bridge.connect();
    last().open();
    expect(bridge.send(makeMessage('ping', {}))).toBe(true);
  });

  it('keeps retrying when the socket constructor throws', () => {
    let calls = 0;
    const bridge = new Bridge({
      createSocket: () => {
        calls++;
        throw new Error('refused');
      },
      extVersion: '0.1.0',
      onMessage: () => {},
    });
    bridge.connect();
    vi.advanceTimersByTime(RECONNECT_MIN_MS);
    expect(calls).toBe(2);
  });
});

describe('Bridge probe (no refused sockets while the app is closed)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function probed(answers: boolean[]) {
    const sockets: FakeSocket[] = [];
    let asked = 0;
    const bridge = new Bridge({
      createSocket: (url) => {
        const s = new FakeSocket(url);
        sockets.push(s);
        return s;
      },
      extVersion: '0.1.0',
      onMessage: () => undefined,
      probe: async () => answers[Math.min(asked++, answers.length - 1)],
    });
    return { bridge, sockets, asked: () => asked };
  }

  it('opens no socket while the app is not there, and one as soon as it is', async () => {
    const { bridge, sockets, asked } = probed([false, false, true]);
    bridge.connect();
    await vi.advanceTimersByTimeAsync(0);
    expect(sockets).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(RECONNECT_MIN_MS);
    expect(sockets).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(RECONNECT_MIN_MS * 2);
    expect(asked()).toBe(3);
    expect(sockets).toHaveLength(1);
    bridge.close();
  });

  it('asks once at a time however often connect() is called', async () => {
    const { bridge, asked } = probed([false]);
    bridge.connect();
    bridge.connect();
    bridge.connect();
    await vi.advanceTimersByTimeAsync(0);
    expect(asked()).toBe(1);
    bridge.close();
  });

  it('still tries the socket after enough "not there" answers, so a blocked probe never keeps it offline', async () => {
    const { bridge, sockets } = probed([false]);
    bridge.connect();
    for (let i = 0; i < PROBE_TRUST_LIMIT; i++) await vi.advanceTimersByTimeAsync(RECONNECT_MAX_MS);
    expect(sockets.length).toBeGreaterThanOrEqual(1);
    bridge.close();
  });

  it('httpProbe says yes on any answer and no on a refused or slow one', async () => {
    const ok = httpProbe((async () => new Response(null, { status: 426 })) as unknown as typeof fetch, 'http://127.0.0.1:1/', 50);
    const refused = httpProbe((async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch, 'http://127.0.0.1:1/', 50);
    expect(await ok()).toBe(true);
    expect(await refused()).toBe(false);
  });
});
