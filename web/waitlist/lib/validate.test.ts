import { validateJoin, validateUsage } from './validate.js';

describe('validateJoin', () => {
  it('accepts an email with consent and normalizes it', () => {
    const r = validateJoin({ email: '  Maya@Example.COM ', consent: true });
    expect(r).toEqual({ ok: true, value: { email: 'maya@example.com', consent: true } });
  });

  it('accepts a JSON string body', () => {
    const r = validateJoin(JSON.stringify({ email: 'a@b.co', consent: true }));
    expect(r.ok).toBe(true);
  });

  it('rejects broken JSON strings', () => {
    const r = validateJoin('{"email":');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it('rejects non-objects', () => {
    for (const body of [null, undefined, 42, 'text', [1, 2], true]) {
      expect(validateJoin(body).ok).toBe(false);
    }
  });

  it('rejects missing or false consent', () => {
    expect(validateJoin({ email: 'a@b.co' }).ok).toBe(false);
    expect(validateJoin({ email: 'a@b.co', consent: false }).ok).toBe(false);
    expect(validateJoin({ email: 'a@b.co', consent: 'yes' }).ok).toBe(false);
  });

  it('rejects bad emails', () => {
    for (const email of ['', 'nope', 'a@b', '@b.co', 'a b@c.co', 'a@b.co,c@d.co', 7, 'x'.repeat(250) + '@b.co']) {
      expect(validateJoin({ email, consent: true }).ok).toBe(false);
    }
  });

  it('rejects unknown fields', () => {
    const r = validateJoin({ email: 'a@b.co', consent: true, price: 9 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });
});

const ID = '3f1c2a9e-7b4d-4c1a-9e2f-5a6b7c8d9e0f';

describe('validateUsage', () => {
  it('accepts an install id with count fields', () => {
    const r = validateUsage({ installId: ID, tabsSetAside: 31, linesSetAside: 1, sidySpoke: 2, stepsShown: 3, stepsClicked: 2, stillWorking10m: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.tabsSetAside).toBe(31);
  });

  it('defaults missing counts to zero', () => {
    const r = validateUsage({ installId: ID, stepsShown: 1 });
    expect(r.ok && r.value).toEqual({
      installId: ID,
      tabsSetAside: 0,
      linesSetAside: 0,
      sidySpoke: 0,
      stepsShown: 1,
      stepsClicked: 0,
      stillWorking10m: 0,
    });
  });

  it('rejects a missing or malformed install id', () => {
    expect(validateUsage({ stepsShown: 1 }).ok).toBe(false);
    expect(validateUsage({ installId: 'not-a-uuid' }).ok).toBe(false);
    expect(validateUsage({ installId: 12 }).ok).toBe(false);
  });

  it.each(['url', 'title', 'line', 'domain'])('rejects tab content key %s', (key) => {
    const r = validateUsage({ installId: ID, [key]: 'https://client-bank.com/x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it('rejects any other unknown key', () => {
    expect(validateUsage({ installId: ID, email: 'a@b.co' }).ok).toBe(false);
  });

  it('rejects string, negative, fractional and huge counts', () => {
    expect(validateUsage({ installId: ID, stepsShown: '3' }).ok).toBe(false);
    expect(validateUsage({ installId: ID, stepsShown: -1 }).ok).toBe(false);
    expect(validateUsage({ installId: ID, stepsShown: 1.5 }).ok).toBe(false);
    expect(validateUsage({ installId: ID, stepsShown: 10_000_001 }).ok).toBe(false);
  });

  it('rejects broken JSON strings and non-objects', () => {
    expect(validateUsage('{').ok).toBe(false);
    expect(validateUsage(null).ok).toBe(false);
    expect(validateUsage([ID]).ok).toBe(false);
  });
});
