import { parseEnvFile, pickDatabaseUrl, poolerHint, redact } from './env-file.mjs';

describe('parseEnvFile', () => {
  it('reads KEY=value lines, ignoring comments and blanks', () => {
    const env = parseEnvFile('# note\n\nANTHROPIC_API_KEY=sk-abc\nDATABASE_URI="postgres://u:p@h:6543/db"\nexport X=1\n');
    expect(env).toEqual({ ANTHROPIC_API_KEY: 'sk-abc', DATABASE_URI: 'postgres://u:p@h:6543/db', X: '1' });
  });

  it('keeps = signs inside values', () => {
    expect(parseEnvFile('A=b=c')).toEqual({ A: 'b=c' });
  });

  it('strips single quotes and trailing CR', () => {
    expect(parseEnvFile("A='x y'\r\n")).toEqual({ A: 'x y' });
  });
});

describe('pickDatabaseUrl', () => {
  it('prefers DATABASE_URL over DATABASE_URI and reports which name it used', () => {
    expect(pickDatabaseUrl({ DATABASE_URL: 'a', DATABASE_URI: 'b' })).toEqual({ name: 'DATABASE_URL', url: 'a' });
    expect(pickDatabaseUrl({ DATABASE_URI: 'b' })).toEqual({ name: 'DATABASE_URI', url: 'b' });
    expect(pickDatabaseUrl({})).toBeNull();
  });
});

describe('poolerHint', () => {
  it('flags the IPv6-only direct connection host', () => {
    expect(poolerHint('postgresql://postgres:pw@db.abcdef.supabase.co:5432/postgres')).toMatch(/Transaction pooler/);
  });
  it('accepts a pooler URI', () => {
    expect(poolerHint('postgresql://postgres.abcdef:pw@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres')).toBeNull();
  });
  it('never echoes the password', () => {
    expect(poolerHint('postgresql://postgres:hunter2@db.abcdef.supabase.co:5432/postgres') ?? '').not.toContain('hunter2');
  });
});

describe('redact', () => {
  it('hides URLs and Supabase host names in error text', () => {
    const out = redact('connect failed postgresql://u:p@db.abc.supabase.co:5432/x and getaddrinfo ENOTFOUND db.abc.supabase.co');
    expect(out).not.toContain('abc');
    expect(out).not.toContain('u:p');
  });
});
