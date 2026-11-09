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
    openStep: rec('openStep'),
    suggestTomorrow: rec('suggestTomorrow'),
    saveTomorrowLine: rec('saveTomorrowLine'),
    oneMoreHour: rec('oneMoreHour'),
    bubbleDrawn: rec('bubbleDrawn'),
    updateSettings: rec('updateSettings'),
    setHidden: rec('setHidden'),
    demo: rec('demo'),
    openMain: rec('openMain'),
    wrapup: { retry: rec('retry'), undo: rec('undo'), setTomorrowLine: rec('setTomorrowLine') },
    step: { open: rec('open'), dismiss: rec('dismiss') },
    ask: { ask: rec('ask') },
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
    await routeIpc(ctl, 'side:wrapup.suggest', { id: 'sa1' });
    await routeIpc(ctl, 'side:onemore.choose', { minutes: 30 });
    await routeIpc(ctl, 'side:settings.set', { sidySize: 'large' });
    await routeIpc(ctl, 'side:settings.set', { reactions: false });
    await routeIpc(ctl, 'side:demo', { cmd: 'next-day' });
    expect(calls.map((c) => c[0])).toEqual(['confirmWrapup', 'saveTomorrowLine', 'suggestTomorrow', 'choose', 'updateSettings', 'updateSettings', 'demo']);
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

  it('passes Ask sidy one line and refuses anything else', async () => {
    const { ctl, calls } = fakeController();
    expect(await routeIpc(ctl, 'side:ask', { line: "I'm done for today" })).toEqual({ ok: 'ask' });
    for (const bad of [null, {}, { line: null }, { line: 42 }, { line: 'x'.repeat(2001) }, { line: 'x', run: 'rm -rf ~' }]) {
      const out = await routeIpc(ctl, 'side:ask', bad);
      if (bad && typeof bad === 'object' && 'run' in bad) expect(out).toEqual({ ok: 'ask' });
      else expect(out).toEqual({ error: 'invalid request' });
    }
    // An extra key is stripped, never passed on.
    expect(calls.filter(([n]) => n === 'ask').map(([, a]) => a)).toEqual([["I'm done for today"], ['x']]);
  });

  it('accepts only adapter-shaped app ids in settings', async () => {
    const { ctl } = fakeController();
    expect(await routeIpc(ctl, 'side:settings.set', { apps: ['excel', 'photoshop'] })).toEqual({ ok: 'updateSettings' });
    expect(await routeIpc(ctl, 'side:settings.set', { apps: ['../../etc'] })).toEqual({ error: 'invalid request' });
  });
});
