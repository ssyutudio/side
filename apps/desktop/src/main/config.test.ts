import { DEFAULT_LLM_MODEL, DEFAULT_LLM_TIMEOUT_MS, parseEnvFile, parseTimeoutMs, resolveConfig } from './config';

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

describe('parseTimeoutMs', () => {
  it('reads a whole, positive number of milliseconds', () => {
    expect(parseTimeoutMs('12000')).toBe(12000);
    expect(parseTimeoutMs(' 2500.4 ')).toBe(2500);
  });

  it('rejects anything that is not a positive duration', () => {
    expect(parseTimeoutMs('0')).toBeNull();
    expect(parseTimeoutMs('-1')).toBeNull();
    expect(parseTimeoutMs('soon')).toBeNull();
    expect(parseTimeoutMs('')).toBeNull();
    expect(parseTimeoutMs(undefined)).toBeNull();
  });
});

describe('LLM settings', () => {
  it('keeps the model and timeout that shipped when nothing overrides them', () => {
    const { llm } = resolveConfig({});
    expect(llm.model).toBe(DEFAULT_LLM_MODEL);
    expect(llm.model).toBe('claude-opus-5-5');
    expect(llm.timeoutMs).toBe(DEFAULT_LLM_TIMEOUT_MS);
    expect(llm.timeoutMs).toBe(8000);
    expect(llm.baseUrl).toBeNull();
  });

  it('takes a model, a timeout and an endpoint from the file', () => {
    const { llm } = resolveConfig({
      SIDE_LLM_MODEL: 'claude-haiku-9',
      SIDE_LLM_TIMEOUT_MS: '12000',
      SIDE_LLM_BASE_URL: 'https://ai.side.example/v1',
    });
    expect(llm).toEqual({ model: 'claude-haiku-9', timeoutMs: 12000, baseUrl: 'https://ai.side.example/v1' });
  });

  it('lets the process environment win, and an empty value does not count', () => {
    const { llm } = resolveConfig(
      { SIDE_LLM_MODEL: 'from-file', SIDE_LLM_BASE_URL: 'https://file.example' },
      { SIDE_LLM_MODEL: 'from-proc', SIDE_LLM_BASE_URL: '' },
    );
    expect(llm.model).toBe('from-proc');
    expect(llm.baseUrl).toBe('https://file.example');
  });

  it('falls back to the shipped timeout when the value is not a duration', () => {
    expect(resolveConfig({ SIDE_LLM_TIMEOUT_MS: '0' }).llm.timeoutMs).toBe(DEFAULT_LLM_TIMEOUT_MS);
    expect(resolveConfig({ SIDE_LLM_TIMEOUT_MS: 'soon' }).llm.timeoutMs).toBe(DEFAULT_LLM_TIMEOUT_MS);
  });
});
