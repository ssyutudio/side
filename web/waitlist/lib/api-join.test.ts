import { createJoinHandler } from '../api/join.js';
import { fakeRes, fakeSql } from './testing.js';

describe('join handler', () => {
  it('stores a new email and returns the count', async () => {
    const sql = fakeSql([[{ id: 1 }], [{ count: 7 }]]);
    const res = fakeRes();
    await createJoinHandler(() => sql.tag)({ method: 'POST', body: { email: 'Maya@Example.com', consent: true } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, joined: true, count: 7 });
    expect(sql.calls[0].text).toMatch(/insert into waitlist/i);
    expect(sql.calls[0].text).toMatch(/on conflict do nothing/i);
    expect(sql.calls[0].values).toEqual(['maya@example.com']);
  });

  it('reports an existing email without a second row', async () => {
    const sql = fakeSql([[], [{ count: 7 }]]);
    const res = fakeRes();
    await createJoinHandler(() => sql.tag)({ method: 'POST', body: { email: 'maya@example.com', consent: true } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, joined: false, count: 7 });
  });

  it('returns the count on GET', async () => {
    const sql = fakeSql([[{ count: 3 }]]);
    const res = fakeRes();
    await createJoinHandler(() => sql.tag)({ method: 'GET' }, res);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ count: 3 });
  });

  it('rejects other methods with 405', async () => {
    const res = fakeRes();
    await createJoinHandler(() => fakeSql([]).tag)({ method: 'DELETE' }, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe('GET, POST');
  });

  it('rejects a bad body with 400 and never touches the database', async () => {
    const sql = fakeSql([]);
    const res = fakeRes();
    await createJoinHandler(() => sql.tag)({ method: 'POST', body: '{"email":' }, res);
    expect(res.statusCode).toBe(400);
    expect(res.json().ok).toBe(false);
    expect(sql.calls).toHaveLength(0);
  });

  it('rejects a body whose getter throws (invalid JSON on Vercel) with 400', async () => {
    const req = { method: 'POST' } as { method: string; body?: unknown };
    Object.defineProperty(req, 'body', { get: () => { throw new Error('Invalid JSON'); } });
    const res = fakeRes();
    await createJoinHandler(() => fakeSql([]).tag)(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('answers 503 with a plain reason when the database fails', async () => {
    const res = fakeRes();
    const failing = () => {
      throw new Error('connect ECONNREFUSED postgres://user:secret@host');
    };
    await createJoinHandler(failing)({ method: 'POST', body: { email: 'a@b.co', consent: true } }, res);
    expect(res.statusCode).toBe(503);
    expect(res.body).not.toContain('secret');
    expect(res.json().reason).toMatch(/try again/i);
  });
});
