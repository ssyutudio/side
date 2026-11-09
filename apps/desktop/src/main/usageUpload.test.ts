import { validateUsage, USAGE_COUNT_FIELDS } from '../../../../web/waitlist/lib/validate';
import { buildUsagePayload, uploadUsage } from './usageUpload';
import type { SideNumbers } from '../core/stats';

const numbers: SideNumbers = {
  connected: true, tabsInChrome: 31, tabsOpen: 3, tabsSetAside: 28, stepReady: true, todayLine: 'Set aside 28 tabs in 4 groups.',
  spokeToday: 1, spokeTotal: 4, shown: 3, clicked: 2,
  clickRate: { value: 2 / 3, n: 3 }, stillWorkingRate: { value: 0.5, n: 2 }, lastSecondsToWork: 2.4,
  setAsideTotals: { tabs: 57, lines: 2 },
};
const installId = '7f1c2a7e-5b7e-4a0e-9d6c-2f4b8a1c9e10';

describe('buildUsagePayload', () => {
  it('is accepted as-is by the real server validator', () => {
    const payload = buildUsagePayload(numbers, installId);
    const v = validateUsage(payload);
    expect(v.ok).toBe(true);
  });

  it('holds only the install id and whole-number counts, no text from tabs', () => {
    const payload = buildUsagePayload(numbers, installId);
    for (const [k, v] of Object.entries(payload)) {
      if (k === 'installId') continue;
      expect(Number.isInteger(v)).toBe(true);
    }
    expect(Object.keys(payload).sort()).toEqual(['installId', ...USAGE_COUNT_FIELDS].sort());
    expect(JSON.stringify(payload)).not.toContain('Set aside');
  });
});

describe('uploadUsage', () => {
  it('does nothing while upload is off (the default)', async () => {
    const calls: unknown[] = [];
    const out = await uploadUsage({ enabled: false, endpoint: 'https://x.vercel.app/api/usage', payload: buildUsagePayload(numbers, installId), fetch: async (...a: unknown[]) => { calls.push(a); return new Response('{}'); } });
    expect(out).toBe('off');
    expect(calls).toHaveLength(0);
  });

  it('does nothing until a deployed endpoint exists', async () => {
    const out = await uploadUsage({ enabled: true, endpoint: null, payload: buildUsagePayload(numbers, installId), fetch: async () => new Response('{}') });
    expect(out).toBe('no_endpoint');
  });

  it('posts only the payload when on', async () => {
    let body = '';
    const out = await uploadUsage({
      enabled: true, endpoint: 'https://x.vercel.app/api/usage', payload: buildUsagePayload(numbers, installId),
      fetch: async (_u: unknown, init?: RequestInit) => { body = String(init?.body); return new Response('{"ok":true}', { status: 200 }); },
    });
    expect(out).toBe('sent');
    expect(validateUsage(JSON.parse(body)).ok).toBe(true);
  });
});
