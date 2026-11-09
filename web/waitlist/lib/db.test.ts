import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { databaseUrl, connectionOptions, getSql, resetSqlForTests } from './db';

describe('databaseUrl', () => {
  it('prefers DATABASE_URL', () => {
    expect(databaseUrl({ DATABASE_URL: 'postgres://a', DATABASE_URI: 'postgres://b' })).toBe('postgres://a');
  });
  it('falls back to DATABASE_URI', () => {
    expect(databaseUrl({ DATABASE_URI: 'postgres://b' })).toBe('postgres://b');
  });
  it('treats blank values as missing', () => {
    expect(databaseUrl({ DATABASE_URL: '  ', DATABASE_URI: '' })).toBeNull();
    expect(databaseUrl({})).toBeNull();
  });
});

describe('connectionOptions', () => {
  it('disables prepared statements for the transaction pooler', () => {
    const o = connectionOptions();
    expect(o.prepare).toBe(false);
    expect(o.ssl).toBe('require');
    expect(o.max).toBe(1);
  });
});

describe('getSql', () => {
  afterEach(() => resetSqlForTests());
  it('throws a plain reason without the URL when nothing is configured', () => {
    expect(() => getSql({})).toThrow('Database is not configured.');
  });
  it('does not put the URL in the error', () => {
    try {
      getSql({});
    } catch (e) {
      expect(String(e)).not.toContain('postgres://');
    }
  });
});

describe('schema.sql', () => {
  const sql = readFileSync(join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
  it('is idempotent', () => {
    expect(sql).toMatch(/create table if not exists waitlist/i);
    expect(sql).toMatch(/create table if not exists usage_counts/i);
    expect(sql).toMatch(/create unique index if not exists \w+ on waitlist \(lower\(email\)\)/i);
  });
  it('stores counts only in usage_counts', () => {
    const block = sql.slice(sql.toLowerCase().indexOf('usage_counts'));
    expect(block).not.toMatch(/\b(url|title|line|domain)\b/i);
  });
});
