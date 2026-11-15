import { createLicenseHandler } from '../api/license.js';
import { createLemon, lemonConfig, type Fetch } from './lemon.js';
import { fakeRes, fakeSql } from './testing.js';

const KEY = '38B1460A-5104-4067-A91D-77B872934D51';
const INSTALL = '3f1c2a9e-7b4d-4c1a-9e2f-5a6b7c8d9e0f';
const CFG = { storeId: 11, productId: 22 };

/** A fake Lemon Squeezy: answers each endpoint from a table and records what was asked. */
function lemonFake(answers: Record<string, { status?: number; body: unknown }>) {
  const calls: { path: string; form: Record<string, string> }[] = [];
  const fetchFn: Fetch = async (url, init) => {
    const path = url.split('/').pop()!;
    calls.push({ path, form: Object.fromEntries(new URLSearchParams(String(init?.body))) });
    const a = answers[path] ?? { status: 404, body: {} };
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200 });
  };
  return { lemon: createLemon(CFG, fetchFn), calls };
}

const meta = { store_id: 11, product_id: 22, variant_name: 'Monthly', customer_email: 'x@example.com' };
const valid = { body: { valid: true, license_key: { status: 'inactive', expires_at: null }, instance: null, meta } };
const activated = { body: { activated: true, license_key: { status: 'active', expires_at: '2026-12-15T00:00:00Z' }, instance: { id: 'inst-1' }, meta } };

function handler(lemon: ReturnType<typeof lemonFake>['lemon'] | null, sql = fakeSql([[]])) {
  return createLicenseHandler({ lemon: () => lemon, sql: () => sql.tag });
}

describe('license handler', () => {
  it('reads the store and product ids from the environment', () => {
    expect(lemonConfig({ LEMONSQUEEZY_STORE_ID: '11', LEMONSQUEEZY_PRODUCT_ID: '22' })).toEqual(CFG);
    expect(lemonConfig({ LEMONSQUEEZY_STORE_ID: '11' })).toBeNull();
  });

  it('activates a key of ours with the install id as the instance name, and returns no customer details', async () => {
    const f = lemonFake({ validate: valid, activate: activated });
    const res = fakeRes();
    await handler(f.lemon)({ method: 'POST', body: { action: 'activate', licenseKey: KEY, instanceName: INSTALL } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, instanceId: 'inst-1', status: 'active', expiresAt: '2026-12-15T00:00:00Z', plan: 'Monthly' });
    expect(f.calls.map((c) => c.path)).toEqual(['validate', 'activate']);
    expect(f.calls[1].form).toEqual({ license_key: KEY, instance_name: INSTALL });
    expect(res.body).not.toContain('example.com');
  });

  it('refuses a key from another Lemon Squeezy store without spending an activation', async () => {
    const f = lemonFake({ validate: { body: { ...valid.body, meta: { ...meta, store_id: 99 } } }, activate: activated });
    const res = fakeRes();
    await handler(f.lemon)({ method: 'POST', body: { action: 'activate', licenseKey: KEY, instanceName: INSTALL } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.json().reason).toMatch(/not for Side/);
    expect(f.calls.map((c) => c.path)).toEqual(['validate']);
  });

  it('refuses to activate an ended subscription', async () => {
    const f = lemonFake({ validate: { body: { ...valid.body, license_key: { status: 'expired', expires_at: null } } } });
    const res = fakeRes();
    await handler(f.lemon)({ method: 'POST', body: { action: 'activate', licenseKey: KEY, instanceName: INSTALL } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.json().reason).toMatch(/ended/);
  });

  it('says 503 when Lemon Squeezy is down', async () => {
    const f = lemonFake({ validate: { status: 500, body: {} } });
    const res = fakeRes();
    await handler(f.lemon)({ method: 'POST', body: { action: 'validate', licenseKey: KEY, instanceId: 'inst-1' } }, res);
    expect(res.statusCode).toBe(503);
  });

  it('deactivates and forgets the cached check for that Mac', async () => {
    const f = lemonFake({ validate: valid, deactivate: { body: { deactivated: true, meta } } });
    const sql = fakeSql([[]]);
    const res = fakeRes();
    await handler(f.lemon, sql)({ method: 'POST', body: { action: 'deactivate', licenseKey: KEY, instanceId: 'inst-1' } }, res);
    expect(res.statusCode).toBe(200);
    expect(f.calls[1]).toEqual({ path: 'deactivate', form: { license_key: KEY, instance_id: 'inst-1' } });
    expect(sql.calls[0].text).toMatch(/delete from license_checks/);
    expect(sql.calls[0].values).not.toContain(KEY);
  });

  it.each([
    [{ action: 'activate', licenseKey: KEY, instanceName: 'my MacBook' }],
    [{ action: 'activate', licenseKey: 'short', instanceName: INSTALL }],
    [{ action: 'nope', licenseKey: KEY }],
    [{ action: 'validate', licenseKey: KEY, instanceId: 'inst-1', email: 'a@b.co' }],
  ])('rejects a malformed body %j with 400 and calls nothing', async (body) => {
    const f = lemonFake({});
    const res = fakeRes();
    await handler(f.lemon)({ method: 'POST', body }, res);
    expect(res.statusCode).toBe(400);
    expect(f.calls).toHaveLength(0);
  });

  it('says 503 when the server has no Lemon Squeezy settings', async () => {
    const res = fakeRes();
    await handler(null)({ method: 'POST', body: { action: 'validate', licenseKey: KEY, instanceId: 'inst-1' } }, res);
    expect(res.statusCode).toBe(503);
  });
});
