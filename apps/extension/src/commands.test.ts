import { createCommandRunner } from './commands';
import { createFakeChrome, makeTab } from './testing/fakeChrome';
import type { FakeChrome } from './testing/fakeChrome';
import type { ChromeApi } from './api';
import { makeMessage } from '@side/shared';
import type { Message } from '@side/shared';

const U = (n: number) => `https://github.com/o/r/issues/${n}`;

function setup(f: FakeChrome = createFakeChrome([makeTab(1, U(1), { active: true }), makeTab(2, U(2)), makeTab(3, U(3))])) {
  const run = createCommandRunner({
    api: f.chrome as unknown as ChromeApi,
    getExclusions: async () => [],
    now: () => 1,
    openOptions: { loadTimeoutMs: 100, restoreWaitMs: 100 },
  });
  return { f, run };
}

const apply = (closeTabIds: number[] = []) =>
  makeMessage('cmd.wrapup.apply', {
    setAsideId: 'sa',
    groups: [{ key: 'k', name: 'Issues', tabIds: [2, 3] }],
    closeTabIds,
    expectUrls: { '2': U(2), '3': U(3) },
  });

function payloadOf(m: Message | null) {
  return m!.payload as { ok: boolean; result?: any; error?: { kind: string; message: string } };
}

describe('command runner', () => {
  it('replies to a command with replyTo set to the command id', async () => {
    const { run } = setup();
    const cmd = apply();
    const reply = await run(cmd);
    expect(reply!.type).toBe('cmd.result');
    expect(reply!.replyTo).toBe(cmd.id);
    expect(payloadOf(reply).ok).toBe(true);
    expect(payloadOf(reply).result.grouped[0].tabIds.sort()).toEqual([2, 3]);
  });

  it('says storage when the journal could not be saved, chrome when Chrome failed, rejected for bad requests', async () => {
    const a = setup();
    a.f.failOn('storage.set', 1);
    expect(payloadOf(await a.run(apply())).error!.kind).toBe('storage');

    const b = setup();
    b.f.failOn('tabs.group', 1);
    expect(payloadOf(await b.run(apply())).error!.kind).toBe('chrome');

    const c = setup();
    const bad = await c.run(makeMessage('cmd.step.open', { stepId: 's', url: 'javascript:alert(1)', position: null }));
    expect(payloadOf(bad)).toMatchObject({ ok: false, error: { kind: 'rejected' } });
    const none = await c.run(makeMessage('cmd.wrapup.undo', { setAsideId: 'missing' }));
    expect(payloadOf(none).error!.kind).toBe('rejected');
  });

  it('runs commands one at a time, so an Undo sent right after Apply sees the finished wrap up', async () => {
    const { f, run } = setup();
    const [r1, r2] = await Promise.all([run(apply([2, 3])), run(makeMessage('cmd.wrapup.undo', { setAsideId: 'sa' }))]);
    expect(payloadOf(r1).ok).toBe(true);
    expect(payloadOf(r2)).toMatchObject({ ok: true, result: { reopened: 2 } });
    expect([...f.tabs.values()].map((t) => t.url).sort()).toEqual([U(1), U(2), U(3)]);
  });

  it('returns null for messages that are not commands', async () => {
    const { run } = setup();
    expect(await run(makeMessage('welcome', { appVersion: '1' }))).toBeNull();
    expect(await run(makeMessage('tabs.request', {}))).toBeNull();
  });

  it('keeps working after a command throws something unexpected', async () => {
    const { f, run } = setup();
    f.chrome.tabs.query = (() => {
      throw new TypeError('weird');
    }) as never;
    const r = await run(makeMessage('cmd.wrapup.undo', { setAsideId: 'x' }));
    expect(payloadOf(r).ok).toBe(false);
    const again = await run(makeMessage('cmd.step.open', { stepId: 's', url: 'chrome://x', position: null }));
    expect(payloadOf(again).error!.kind).toBe('rejected');
  });
});
