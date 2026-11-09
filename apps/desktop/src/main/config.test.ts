import { parseEnvFile, resolveConfig } from './config';

describe('parseEnvFile', () => {
  it('reads KEY=value lines and ignores comments and blanks', () => {
    const env = parseEnvFile('# comment\n\nANTHROPIC_API_KEY=sk-test\nDATABASE_URI="postgres://u:p@h:6543/db"\n  SPACED = v \n');
    expect(env).toEqual({ ANTHROPIC_API_KEY: 'sk-test', DATABASE_URI: 'postgres://u:p@h:6543/db', SPACED: 'v' });
  });

  it('keeps = signs inside values', () => {
    expect(parseEnvFile('A=b=c')).toEqual({ A: 'b=c' });
  });
});

describe('resolveConfig', () => {
  it('prefers DATABASE_URL and falls back to DATABASE_URI', () => {
    expect(resolveConfig({ DATABASE_URL: 'a', DATABASE_URI: 'b' }).databaseUrl).toBe('a');
    expect(resolveConfig({ DATABASE_URI: 'b' }).databaseUrl).toBe('b');
    expect(resolveConfig({}).databaseUrl).toBeNull();
  });

  it('treats a missing or empty key as absent', () => {
    expect(resolveConfig({ ANTHROPIC_API_KEY: '' }).anthropicKey).toBeNull();
    expect(resolveConfig({ ANTHROPIC_API_KEY: 'k' }).anthropicKey).toBe('k');
  });

  it('lets the process environment win over the file', () => {
    expect(resolveConfig({ ANTHROPIC_API_KEY: 'file' }, { ANTHROPIC_API_KEY: 'proc' }).anthropicKey).toBe('proc');
  });
});
