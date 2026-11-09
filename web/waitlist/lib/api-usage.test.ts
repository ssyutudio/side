import { createUsageHandler } from '../api/usage.js';
import { fakeRes, fakeSql } from './testing.js';

const ID = '3f1c2a9e-7b4d-4c1a-9e2f-5a6b7c8d9e0f';

describe('usage handler', () => {
  it('upserts counts by install id', async () => {
    const sql = fakeSql([[]]);
    const res = fakeRes();
    await createUsageHandler(() => sql.tag)({ method: 'POST', body: { installId: ID, tabsSetAside: 31, stepsShown: 2 } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(sql.calls[0].text).toMatch(/insert into usage_counts/i);
    expect(sql.calls[0].text).toMatch(/on conflict \(install_id\) do update/i);
    expect(sql.calls[0].values).toEqual([ID, 31, 0, 0, 2, 0, 0]);
  });

  it.each(['url', 'title', 'line', 'domain'])('refuses a body carrying %s with 400 and no query', async (key) => {
    const sql = fakeSql([]);
    const res = fakeRes();
    await createUsageHandler(() => sql.tag)({ method: 'POST', body: { installId: ID, [key]: 'x' } }, res);
    expect(res.statusCode).toBe(400);
    expect(sql.calls).toHaveLength(0);
  });

  it('rejects broken JSON with 400', async () => {
    const res = fakeRes();
    await createUsageHandler(() => fakeSql([]).tag)({ method: 'POST', body: '{' }, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns totals on GET', async () => {
    const sql = fakeSql([[{ installs: 2, tabs_set_aside: 40, lines_set_aside: 2, sidy_spoke: 3, steps_shown: 4, steps_clicked: 3, still_working_10m: 2 }]]);
    const res = fakeRes();
    await createUsageHandler(() => sql.tag)({ method: 'GET' }, res);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ installs: 2, tabsSetAside: 40, linesSetAside: 2, sidySpoke: 3, stepsShown: 4, stepsClicked: 3, stillWorking10m: 2 });
  });

  it('rejects other methods with 405', async () => {
    const res = fakeRes();
    await createUsageHandler(() => fakeSql([]).tag)({ method: 'PUT' }, res);
    expect(res.statusCode).toBe(405);
  });

  it('answers 503 when the database fails', async () => {
    const res = fakeRes();
    await createUsageHandler(() => { throw new Error('down'); })({ method: 'POST', body: { installId: ID } }, res);
    expect(res.statusCode).toBe(503);
  });
});
