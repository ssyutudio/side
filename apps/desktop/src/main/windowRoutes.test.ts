import { routeWindow, WINDOW_CHANNELS, type WindowPort } from './windowRoutes';

function fakePort() {
  const calls: [string, unknown][] = [];
  const port: WindowPort = {
    openMini: (v) => void calls.push(['openMini', v]),
    toggleMini: () => void calls.push(['toggleMini', null]),
    closeMini: () => void calls.push(['closeMini', null]),
    resizeMini: (h) => void calls.push(['resizeMini', h]),
    moveSidy: (y, done) => void calls.push(['moveSidy', [y, done]]),
    toast: (t, ms) => void calls.push(['toast', [t, ms]]),
    checkConnection: async () => 'connected',
    revealData: () => void calls.push(['revealData', null]),
    setupInfo: () => ({ extPath: '/x/apps/extension/dist' }),
    finishSetup: () => void calls.push(['finishSetup', null]),
  };
  return { port, calls };
}

describe('routeWindow', () => {
  it('serves every window channel under side:', () => {
    expect(WINDOW_CHANNELS.every((c) => c.startsWith('side:'))).toBe(true);
  });

  it('dispatches valid requests', async () => {
    const { port, calls } = fakePort();
    await routeWindow(port, 'side:mini.open', { view: 'wrap' });
    await routeWindow(port, 'side:mini.resize', { height: 640 });
    await routeWindow(port, 'side:sidy.move', { y: 412, done: true });
    await routeWindow(port, 'side:toast', { text: 'Saved your question. See you tomorrow.', ms: 3500 });
    expect(await routeWindow(port, 'side:check.connection', undefined)).toEqual({ status: 'connected' });
    expect(await routeWindow(port, 'side:setup.info', undefined)).toEqual({ extPath: '/x/apps/extension/dist' });
    await routeWindow(port, 'side:setup.done', undefined);
    expect(calls.map((c) => c[0])).toEqual(['openMini', 'resizeMini', 'moveSidy', 'toast', 'finishSetup']);
    expect(calls[2][1]).toEqual([412, true]);
  });

  it('refuses bad sizes, long toasts and unknown views without calling anything', async () => {
    const { port, calls } = fakePort();
    expect(await routeWindow(port, 'side:mini.resize', { height: 99999 })).toEqual({ error: 'invalid request' });
    expect(await routeWindow(port, 'side:toast', { text: 'x'.repeat(500), ms: 1000 })).toEqual({ error: 'invalid request' });
    expect(await routeWindow(port, 'side:mini.open', { view: 'file:///etc/passwd' })).toEqual({ error: 'invalid request' });
    expect(await routeWindow(port, 'side:sidy.move', { y: 1.5, done: false })).toEqual({ error: 'invalid request' });
    expect(await routeWindow(port, 'side:sidy.move', { y: 400 })).toEqual({ error: 'invalid request' });
    expect(calls).toEqual([]);
  });
});
