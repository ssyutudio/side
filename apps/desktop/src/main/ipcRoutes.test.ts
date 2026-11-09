import { routeIpc, IPC_CHANNELS } from './ipcRoutes';

function fakeController() {
  const calls: [string, unknown[]][] = [];
  const rec = (name: string) => (...args: unknown[]) => {
    calls.push([name, args]);
    return Promise.resolve({ ok: name });
  };
  const ctl: any = {
    state: () => ({ connection: 'connected' }),
    previewWrapup: rec('previewWrapup'),
    confirmWrapup: rec('confirmWrapup'),
    oneMoreHour: rec('oneMoreHour'),
    bubbleDrawn: rec('bubbleDrawn'),
    updateSettings: rec('updateSettings'),
    setHidden: rec('setHidden'),
    demo: rec('demo'),
    openMain: rec('openMain'),
    wrapup: { retry: rec('retry'), undo: rec('undo'), setTomorrowLine: rec('setTomorrowLine') },
    step: { open: rec('open'), dismiss: rec('dismiss') },
    speak: { choose: rec('choose'), answer: rec('answer'), setFocus: rec('setFocus'), clear: rec('clear') },
    publish: () => undefined,
  };
  return { ctl, calls };
}

describe('routeIpc', () => {
  it('lists every channel under the side: prefix', () => {
    expect(IPC_CHANNELS.every((c) => c.startsWith('side:'))).toBe(true);
  });

  it('dispatches valid requests', async () => {
    const { ctl, calls } = fakeController();
    await routeIpc(ctl, 'side:wrapup.confirm', { closeGroupKeys: ['g1'] });
    await routeIpc(ctl, 'side:wrapup.tomorrow', { id: 'sa1', line: null });
    await routeIpc(ctl, 'side:onemore.choose', { minutes: 30 });
    await routeIpc(ctl, 'side:settings.set', { sidySize: 'large' });
    await routeIpc(ctl, 'side:demo', { cmd: 'next-day' });
    expect(calls.map((c) => c[0])).toEqual(['confirmWrapup', 'setTomorrowLine', 'choose', 'updateSettings', 'demo']);
  });

  it('rejects malformed or unknown requests without calling anything', async () => {
    const { ctl, calls } = fakeController();
    expect(await routeIpc(ctl, 'side:onemore.choose', { minutes: 45 })).toEqual({ error: 'invalid request' });
    expect(await routeIpc(ctl, 'side:settings.set', { llmEnabled: 'yes' })).toEqual({ error: 'invalid request' });
    expect(await routeIpc(ctl, 'side:settings.set', { excludedDomains: 'bank.com' })).toEqual({ error: 'invalid request' });
    expect(await routeIpc(ctl, 'side:demo', { cmd: 'rm -rf' })).toEqual({ error: 'invalid request' });
    expect(await routeIpc(ctl, 'side:format', {})).toEqual({ error: 'unknown channel' });
    expect(await routeIpc(ctl, 'side:step.open', null)).toEqual({ error: 'invalid request' });
    expect(calls).toEqual([]);
  });

  it('returns the view state', async () => {
    const { ctl } = fakeController();
    expect(await routeIpc(ctl, 'side:state', undefined)).toEqual({ connection: 'connected' });
  });
});
