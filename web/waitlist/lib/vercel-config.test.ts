import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

describe('vercel deploy layout', () => {
  it('keeps only function entry points in api/', () => {
    const files = readdirSync(join(ROOT, 'api'));
    expect(files.filter((f) => f.endsWith('.test.ts'))).toEqual([]);
    expect(files.sort()).toEqual(['join.ts', 'usage.ts']);
  });

  it('has a valid vercel.json that covers the api functions', () => {
    const cfg = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
    expect(Object.keys(cfg.functions)).toContain('api/*.ts');
  });

  it('compiles functions as CommonJS so extensionless relative imports resolve', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    expect(pkg.type).not.toBe('module');
    expect(pkg.dependencies.postgres).toBeTruthy();
  });
});
